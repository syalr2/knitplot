import type { WorkspaceSave } from "./workspace";
import { STORAGE_KEY } from "./workspace";
import { HttpError } from "./http";

export class WorkspacePersistence {
  private blocked = false;
  constructor(
    private storage: Pick<Storage, "getItem" | "setItem">,
    private expected: string | null,
  ) {}
  save(workspace: WorkspaceSave) {
    if (this.blocked)
      throw new HttpError(
        "Your workspace changed in another window. Download this chart from File before reloading to avoid losing either copy.",
      );
    if (this.storage.getItem(STORAGE_KEY) !== this.expected) {
      this.blocked = true;
      throw new HttpError(
        "Your workspace changed in another window. Download this chart from File before reloading to avoid losing either copy.",
      );
    }
    const serialized = JSON.stringify(workspace);
    this.storage.setItem(STORAGE_KEY, serialized);
    this.expected = serialized;
  }
}
