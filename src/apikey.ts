import { validateApiKey as getKeyLimit } from "./db.js";
import { client } from "./redis.js";

export enum keyStatus {
  invalid,
  valid,
  exhausted
}

const day = new Date().getUTCDay()

export const checkKeyLimit = async (key: string): Promise<keyStatus> => {
  const limit = await getKeyLimit(key);
  // add to redis counter
  const hasKey = !!limit
  if (hasKey) {
    client.incr(`usecount:${key}`);
    // daily ratelimit
    const dailyKey = `ratelimit:${day}:${key}`;
    const count = await client.incr(dailyKey);
    if (count === 1) {
      client.expire(dailyKey, 86400); // 24 hour expiry
    } else if (count > limit) {
      return keyStatus.exhausted;
    }
    return keyStatus.valid;
  }
  return keyStatus.invalid;
}

export const checkKeyValidity = async (key: string): Promise<boolean> => {
  const limit = await getKeyLimit(key);
  return !!limit
}