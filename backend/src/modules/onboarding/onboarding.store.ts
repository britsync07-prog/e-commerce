import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OnboardingData } from "./onboarding.types.js";

const emptyData = (): OnboardingData => ({
  owners: [],
  shops: [],
  products: [],
  channels: [],
  audit: []
});

export class OnboardingStore {
  private data: OnboardingData | undefined;
  private readonly path: string;

  constructor(path = "data/onboarding.dev.json") {
    this.path = resolve(process.cwd(), path);
  }

  getData() {
    if (!this.data) {
      this.data = this.read();
    }

    return this.data;
  }

  save() {
    if (!this.data) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  resetForTests() {
    this.data = emptyData();
    this.save();
  }

  private read(): OnboardingData {
    if (!existsSync(this.path)) return emptyData();
    return JSON.parse(readFileSync(this.path, "utf8")) as OnboardingData;
  }
}

export const onboardingStore = new OnboardingStore();

