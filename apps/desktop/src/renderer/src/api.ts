import type { FormeApi } from '../../shared/api.js';

declare global {
  interface Window {
    forme: FormeApi;
  }
}

export const api: FormeApi = window.forme;
