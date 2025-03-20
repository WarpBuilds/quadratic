import { focusGrid } from '@/app/helpers/focusGrid.js';
import type { SearchOptions } from '@/app/quadratic-core-types';
import type { User } from '@/auth/auth';
import type { FilePermission } from 'quadratic-shared/typesAndSchemas';
import { type TeamSettings } from 'quadratic-shared/typesAndSchemas';
import { atom, DefaultValue, selector } from 'recoil';

export interface EditorInteractionState {
  isRunningAsyncAction: boolean;
  showCellTypeMenu: boolean;
  showCommandPalette: boolean;
  showConnectionsMenu: boolean;
  showGoToMenu: boolean;
  showFeedbackMenu: boolean;
  showRenameFileMenu: boolean;
  showShareFileMenu: boolean;
  showSearch: boolean | SearchOptions;
  showContextMenu: boolean;
  showValidation: boolean | string;
  showVersionHistoryDialog: boolean;
  annotationState?: 'dropdown' | 'date-format' | 'calendar' | 'calendar-time';
  permissions: FilePermission[];
  settings: TeamSettings;
  user?: User;
  fileUuid: string;
  teamUuid: string;
  follow?: string;
  undo: boolean;
  redo: boolean;
}

export const defaultEditorInteractionState: EditorInteractionState = {
  isRunningAsyncAction: false,
  showCellTypeMenu: false,
  showCommandPalette: false,
  showConnectionsMenu: false,
  showGoToMenu: false,
  showFeedbackMenu: false,
  showRenameFileMenu: false,
  showShareFileMenu: false,
  showSearch: false,
  showContextMenu: false,
  showValidation: false,
  showVersionHistoryDialog: false,
  annotationState: undefined,
  permissions: ['FILE_VIEW'], // FYI: when we call <RecoilRoot> we initialize this with the value from the server
  settings: {
    analyticsAi: false,
  },
  user: undefined, // when we call <RecoilRoot> we initialize this with the value from the server
  fileUuid: '', // when we call <RecoilRoot> we initialize this with the value from the server
  teamUuid: '', // when we call <RecoilRoot> we initialize this with the value from the server
  follow: undefined,
  undo: false,
  redo: false,
};

export const editorInteractionStateAtom = atom<EditorInteractionState>({
  key: 'editorInteractionState',
  default: defaultEditorInteractionState,
  effects: [
    // this effect is used to focus the grid when the modal is closed
    ({ onSet }) => {
      onSet((newValue, oldValue) => {
        if (oldValue instanceof DefaultValue) return;
        const oldModalShow =
          oldValue.showCellTypeMenu ||
          oldValue.showCommandPalette ||
          oldValue.showConnectionsMenu ||
          oldValue.showGoToMenu ||
          oldValue.showFeedbackMenu ||
          oldValue.showRenameFileMenu ||
          oldValue.showShareFileMenu ||
          oldValue.showSearch ||
          oldValue.showContextMenu ||
          oldValue.showVersionHistoryDialog;
        const newModelShow =
          newValue.showCellTypeMenu ||
          newValue.showCommandPalette ||
          newValue.showConnectionsMenu ||
          newValue.showGoToMenu ||
          newValue.showFeedbackMenu ||
          newValue.showRenameFileMenu ||
          newValue.showShareFileMenu ||
          newValue.showSearch ||
          newValue.showContextMenu ||
          newValue.showVersionHistoryDialog;
        if (oldModalShow && !newModelShow) {
          focusGrid();
        }
      });
    },
  ],
});

const createSelector = <T extends keyof EditorInteractionState>(key: T) =>
  selector<EditorInteractionState[T]>({
    key: `editorInteractionState${key.charAt(0).toUpperCase() + key.slice(1)}Atom`,
    get: ({ get }) => get(editorInteractionStateAtom)[key],
    set: ({ set }, newValue) =>
      set(editorInteractionStateAtom, (prev) => ({
        ...prev,
        [key]: newValue instanceof DefaultValue ? prev[key] : newValue,
      })),
  });

export const editorInteractionStateShowIsRunningAsyncActionAtom = createSelector('isRunningAsyncAction');
export const editorInteractionStateShowCellTypeMenuAtom = createSelector('showCellTypeMenu');
export const editorInteractionStateShowCommandPaletteAtom = createSelector('showCommandPalette');
export const editorInteractionStateShowConnectionsMenuAtom = createSelector('showConnectionsMenu');
export const editorInteractionStateShowGoToMenuAtom = createSelector('showGoToMenu');
export const editorInteractionStateShowFeedbackMenuAtom = createSelector('showFeedbackMenu');
export const editorInteractionStateShowRenameFileMenuAtom = createSelector('showRenameFileMenu');
export const editorInteractionStateShowShareFileMenuAtom = createSelector('showShareFileMenu');
export const editorInteractionStateShowSearchAtom = createSelector('showSearch');
export const editorInteractionStateShowContextMenuAtom = createSelector('showContextMenu');
export const editorInteractionStateShowValidationAtom = createSelector('showValidation');
export const editorInteractionStateShowVersionHistoryDialogAtom = createSelector('showVersionHistoryDialog');

export const editorInteractionStateAnnotationStateAtom = createSelector('annotationState');
export const editorInteractionStatePermissionsAtom = createSelector('permissions');
export const editorInteractionStateSettingsAtom = createSelector('settings');
export const editorInteractionStateUserAtom = createSelector('user');
export const editorInteractionStateFileUuidAtom = createSelector('fileUuid');
export const editorInteractionStateTeamUuidAtom = createSelector('teamUuid');
export const editorInteractionStateFollowAtom = createSelector('follow');
export const editorInteractionStateUndoAtom = createSelector('undo');
export const editorInteractionStateRedoAtom = createSelector('redo');
