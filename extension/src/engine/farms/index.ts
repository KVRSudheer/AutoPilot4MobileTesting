import type { FarmProvider } from "../types.js";
import { browserStack } from "./browserstack.js";
import { sauceLabs } from "./saucelabs.js";
import { lambdaTest } from "./lambdatest.js";
import { customFarm } from "./custom.js";
import type { DeviceFarm } from "./provider.js";

const FARMS: Record<FarmProvider, DeviceFarm> = {
  browserstack: browserStack,
  saucelabs: sauceLabs,
  lambdatest: lambdaTest,
  custom: customFarm,
};

export function getFarm(provider: FarmProvider): DeviceFarm {
  const farm = FARMS[provider];
  if (!farm) throw new Error(`Unknown device farm provider: ${provider}`);
  return farm;
}

export { browserStack, sauceLabs, lambdaTest };
export type { DeviceFarm, FarmConnection } from "./provider.js";
