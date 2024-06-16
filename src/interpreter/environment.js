import { DuplicateBinding, NameError } from "../utils/errors.js";
import { Value } from "./types.js";

export class Env {
  /**
   * @param {Env | null} parent
   */
  constructor (parent = null) {
    this.parent = parent;
    this.bindings = new Map();
    this.readonly = false;
  }

  /**
   * @param {string} name
   * @param {Value} value
   */
  bind = (name, value) => {
    if (this.bindings.has(name)) {
      throw new DuplicateBinding(name);
    }
    this.bindings.set(name, value);
    return value;
  };

  /**
   * @param {string} name
   */
  get = name => {
    let cursor = this;
    while (cursor) {
      const found =
        cursor.bindings.get(name) || cursor.bindings.get(name?.name);
      if (found) {
        return found;
      }
      cursor = cursor.parent;
    }
    throw new NameError(name);
  };

  /**
   * 
   * @param {string} name
   * @param {Value} value
   */
  set = (name, value) => {
    let cursor = this;
    while (cursor) {
      if (cursor.bindings.has(name)) {
        if (cursor.readonly) {
          throw new Error('dont mutate builtins >:');
        }
        cursor.bindings.set(name, value);
        return value;
      }
      cursor = cursor.parent;
    }
    // throw new NameError(name, this);
    // temporary hack to allow adding new globals:
    this.bindings.set(name, value);
    return value;
  }
}
