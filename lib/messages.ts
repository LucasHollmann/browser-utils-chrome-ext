import type { FaviconBadgeStyle } from './favicon-badge';
import type { NormalizeOptions } from './normalize-url';

/** Uma aba aberta, do ponto de vista do content script (dados mínimos). */
export interface OpenTab {
  tabId: number;
  /** URL normalizada. */
  key: string;
  title: string;
}

/** Um grupo de abas que apontam para a mesma página (usado no popup). */
export interface DuplicateGroup {
  key: string;
  tabs: Array<{
    tabId: number;
    windowId: number;
    title: string;
    url: string;
    favIconUrl?: string;
    active: boolean;
    incognito: boolean;
  }>;
}

/** Background → content script: tudo que o content script precisa saber. */
export interface TabStateMessage {
  type: 'tab-state';
  /** Esta aba tem pelo menos uma irmã com a mesma URL normalizada? */
  isDuplicate: boolean;
  /** Quantas abas estão nesta mesma página (inclui a atual). */
  duplicateCount: number;
  titlePrefixEnabled: boolean;
  titlePrefix: string;
  faviconBadgeEnabled: boolean;
  faviconBadgeStyle: FaviconBadgeStyle;
  tooltipEnabled: boolean;
  focusExistingTabEnabled: boolean;
  filePickerEnabled: boolean;
  normalize: NormalizeOptions;
  /** Abas abertas visíveis para esta aba, exceto ela mesma. */
  openTabs: OpenTab[];
}

/** Content script → background, ao (re)iniciar. */
export interface RequestStateMessage {
  type: 'request-state';
}

/** Content script → background: baixar um favicon sem esbarrar em CORS. */
export interface FetchFaviconMessage {
  type: 'fetch-favicon';
  url: string;
}

/** Content script → background: focar a aba já aberta. */
export interface FocusTabMessage {
  type: 'focus-tab';
  tabId: number;
}

/** Popup → background. */
export interface GetGroupsMessage {
  type: 'get-duplicate-groups';
}

export type ToBackgroundMessage =
  | RequestStateMessage
  | FetchFaviconMessage
  | FocusTabMessage
  | GetGroupsMessage;
