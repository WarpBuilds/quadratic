import { Coordinate } from '@/app/gridGL/types/size';
import { CodeCellLanguage, SearchOptions } from '@/app/quadratic-core-types';
import { FilePermission } from 'quadratic-shared/typesAndSchemas';
import { atom } from 'recoil';

export interface EditorInteractionState {
  showCellTypeMenu: boolean;
  showCodeEditor: boolean;
  showCommandPalette: boolean;
  showGoToMenu: boolean;
  showFeedbackMenu: boolean;
  showShareFileMenu: boolean;
  showSearch: boolean | SearchOptions;
  permissions: FilePermission[];
  uuid: string;
  selectedCell: Coordinate;
  selectedCellSheet: string;
  mode?: CodeCellLanguage;
  follow?: string;
  editorEscapePressed?: boolean;
  waitingForEditorClose?: {
    selectedCell: Coordinate;
    selectedCellSheet: string;
    mode?: CodeCellLanguage;
    showCellTypeMenu: boolean;
  };
  undo: boolean;
  redo: boolean;
}

export const editorInteractionStateDefault: EditorInteractionState = {
  showCellTypeMenu: false,
  showCodeEditor: false,
  showCommandPalette: false,
  showGoToMenu: false,
  showFeedbackMenu: false,
  showShareFileMenu: false,
  showSearch: false,
  permissions: ['FILE_VIEW'], // FYI: when we call <RecoilRoot> we initialize this with the value from the server
  uuid: '', // when we call <RecoilRoot> we initialize this with the value from the server
  selectedCell: { x: 0, y: 0 },
  selectedCellSheet: '',
  mode: undefined,
  undo: false,
  redo: false,
};

export const editorInteractionStateAtom = atom({
  key: 'editorInteractionState', // unique ID (with respect to other atoms/selectors)
  default: editorInteractionStateDefault,
});
