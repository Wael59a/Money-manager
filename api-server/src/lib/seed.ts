import { logger } from "./logger";

export async function ensureFinanceSeedData(): Promise<void> {
  logger.info("Starting with an empty finance workspace");
}