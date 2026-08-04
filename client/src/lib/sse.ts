import { useEffect, useRef, useState } from "react";
import { apiUrl } from "./api";
import { openEventStream } from "./bridge";
import type { LogLine, RunEvent, SessionState, StepResult, UiElement } from "./types";

export interface RunStreamLite {
  session: SessionState;
  steps: StepResult[];
  finished: boolean;
  liveFrame?: string; // latest live device-screen frame
}

interface BatchEvent {
  runId?: string;
  event?: RunEvent;
  batchDone?: boolean;
}

/**
 * Subscribe to a batch's multiplexed SSE stream and track each run's live
 * session + steps. `initialSessions` seeds the tiles before events arrive.
 */
export function useBatchStream(
  batchId: string | null,
  initialSessions: SessionState[],
): { runs: Record<string, RunStreamLite>; order: string[]; batchDone: boolean } {
  const [runs, setRuns] = useState<Record<string, RunStreamLite>>({});
  const [batchDone, setBatchDone] = useState(false);
  const orderRef = useRef<string[]>([]);
  const stepMaps = useRef<Map<string, Map<number, StepResult>>>(new Map());

  useEffect(() => {
    if (!batchId) return;
    orderRef.current = initialSessions.map((s) => s.id);
    stepMaps.current = new Map();
    const seed: Record<string, RunStreamLite> = {};
    for (const s of initialSessions) {
      seed[s.id] = { session: s, steps: s.steps, finished: false };
      stepMaps.current.set(s.id, new Map(s.steps.map((st) => [st.index, st])));
    }
    setRuns(seed);
    setBatchDone(false);

    const source = openEventStream(apiUrl(`/api/batches/${batchId}/events`));
    source.onmessage = (evt) => {
      let data: BatchEvent;
      try {
        data = JSON.parse(evt.data) as BatchEvent;
      } catch {
        return;
      }
      if (data.batchDone) {
        setBatchDone(true);
        source.close();
        return;
      }
      const runId = data.runId;
      const event = data.event;
      if (!runId || !event) return;

      setRuns((prev) => {
        const cur = prev[runId] ?? {
          session: initialSessions.find((s) => s.id === runId)!,
          steps: [],
          finished: false,
        };
        let map = stepMaps.current.get(runId);
        if (!map) {
          map = new Map();
          stepMaps.current.set(runId, map);
        }
        let next: RunStreamLite = cur;
        if (event.type === "session" || event.type === "done") {
          for (const st of event.session.steps) if (!map.has(st.index)) map.set(st.index, st);
          next = {
            ...cur,
            session: event.session,
            steps: Array.from(map.values()).sort((a, b) => a.index - b.index),
            finished: event.type === "done" ? true : cur.finished,
          };
        } else if (event.type === "step") {
          map.set(event.step.index, event.step);
          next = {
            ...cur,
            steps: Array.from(map.values()).sort((a, b) => a.index - b.index),
          };
        } else if (event.type === "frame") {
          next = { ...cur, liveFrame: event.image };
        } else if (event.type === "error") {
          next = { ...cur, finished: true };
        }
        return { ...prev, [runId]: next };
      });
    };
    source.onerror = () => {
      /* EventSource auto-retries; batchDone closes it */
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  return { runs, order: orderRef.current, batchDone };
}

export interface PausedState {
  step: StepResult;
  candidates: UiElement[];
  reason: string;
}

export interface RunStreamState {
  session: SessionState | null;
  steps: StepResult[];
  logs: LogLine[];
  finished: boolean;
  error: string | null;
  liveFrame: string | null; // latest live device-screen frame
  // Set while the run is held at a pause point awaiting the operator.
  paused: PausedState | null;
}

/**
 * Subscribe to a session's SSE event stream. Connecting starts the run
 * server-side (the server begins the run on first subscription).
 */
export function useRunStream(sessionId: string | null): RunStreamState {
  const [session, setSession] = useState<SessionState | null>(null);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [paused, setPaused] = useState<PausedState | null>(null);
  const stepsRef = useRef<Map<number, StepResult>>(new Map());
  // True only once a terminal (done/error) event actually arrived. Guards
  // against treating an abandoned reconnect (CLOSED) as a finished run.
  const sawTerminalRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    stepsRef.current = new Map();
    sawTerminalRef.current = false;
    setSession(null);
    setSteps([]);
    setLogs([]);
    setFinished(false);
    setError(null);
    setLiveFrame(null);
    setPaused(null);

    const source = openEventStream(apiUrl(`/api/sessions/${sessionId}/events`));

    const syncSteps = (incoming?: StepResult[]) => {
      if (incoming) {
        for (const s of incoming) {
          if (!stepsRef.current.has(s.index)) stepsRef.current.set(s.index, s);
        }
      }
      setSteps(Array.from(stepsRef.current.values()).sort((a, b) => a.index - b.index));
    };

    source.onmessage = (evt) => {
      let data: RunEvent;
      try {
        data = JSON.parse(evt.data) as RunEvent;
      } catch {
        return;
      }

      switch (data.type) {
        case "session":
          setSession(data.session);
          syncSteps(data.session.steps);
          break;
        case "step":
          stepsRef.current.set(data.step.index, data.step);
          syncSteps();
          break;
        case "log":
          setLogs((prev) => [...prev, { level: data.level, message: data.message, at: data.at }]);
          break;
        case "frame":
          setLiveFrame(data.image);
          break;
        case "paused":
          setPaused({ step: data.step, candidates: data.candidates, reason: data.reason });
          break;
        case "resumed":
          setPaused(null);
          break;
        case "done":
          sawTerminalRef.current = true;
          setSession(data.session);
          syncSteps(data.session.steps);
          setFinished(true);
          source.close();
          break;
        case "error":
          sawTerminalRef.current = true;
          setError(data.message);
          setFinished(true);
          source.close();
          break;
      }
    };

    source.onerror = () => {
      // Network blips: EventSource auto-retries on its own. Only treat a closed
      // socket as "finished" if a terminal event actually arrived - otherwise a
      // dropped/abandoned connection would falsely mark a running run complete.
      if (sawTerminalRef.current && source.readyState === EventSource.CLOSED) {
        setFinished(true);
      }
    };

    return () => source.close();
  }, [sessionId]);

  return { session, steps, logs, finished, error, liveFrame, paused };
}
