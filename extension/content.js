// Relay between the Autopilot web app (window.postMessage) and the extension
// service worker (chrome.runtime messaging). Injected on uipath.host and the
// local dev origin. The page and this script rendezvous on `target`/`source`
// = "mta-bridge"; everything else on the page is ignored.
const SOURCE = "mta-bridge";
const streamPorts = new Map();

function reply(msg) {
  window.postMessage({ source: SOURCE, ...msg }, window.location.origin);
}

function closeStream(id) {
  const port = streamPorts.get(id);
  streamPorts.delete(id);
  if (port) {
    try {
      port.disconnect();
    } catch {
      /* already gone */
    }
  }
}

window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (ev.source !== window || !d || d.target !== SOURCE) return;

  switch (d.type) {
    case "ping":
      reply({ type: "ready", version: chrome.runtime.getManifest().version });
      break;

    case "fetch":
      chrome.runtime.sendMessage({ type: "fetch", req: d.req }).then(
        (res) => reply({ type: "fetch-result", id: d.id, res }),
        (err) =>
          reply({
            type: "fetch-result",
            id: d.id,
            res: { ok: false, error: String((err && err.message) || err) },
          }),
      );
      break;

    // Uploads stream the file through in base64 chunks; the final chunk's
    // response carries the server's reply.
    case "upload-begin":
    case "upload-chunk":
      chrome.runtime
        .sendMessage({ type: d.type, id: d.id, seq: d.seq, data: d.data, req: d.req })
        .then(
          (res) => {
            if (res && res.final) reply({ type: "fetch-result", id: d.id, res: res.result });
          },
          (err) =>
            reply({
              type: "fetch-result",
              id: d.id,
              res: { ok: false, error: String((err && err.message) || err) },
            }),
        );
      break;

    case "stream-open": {
      const port = chrome.runtime.connect({ name: "mta-stream" });
      streamPorts.set(d.id, port);
      port.onMessage.addListener((m) => {
        if (m.event === "data") {
          reply({ type: "stream-event", id: d.id, data: m.data });
        } else if (m.event === "ping") {
          // Service-worker keepalive during long waits - not a stream event.
        } else if (m.event === "end") {
          reply({ type: "stream-end", id: d.id });
          closeStream(d.id);
        } else {
          reply({ type: "stream-error", id: d.id, message: m.message });
          closeStream(d.id);
        }
      });
      port.onDisconnect.addListener(() => {
        if (streamPorts.has(d.id)) {
          streamPorts.delete(d.id);
          reply({ type: "stream-error", id: d.id, message: "bridge disconnected" });
        }
      });
      port.postMessage({ path: d.path });
      break;
    }

    case "stream-close":
      closeStream(d.id);
      break;
  }
});

// Announce on load too, in case the page pinged before we were listening.
reply({ type: "ready", version: chrome.runtime.getManifest().version });
