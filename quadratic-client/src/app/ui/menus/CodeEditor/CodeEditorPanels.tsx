import { ResizeControl } from '@/app/ui/menus/CodeEditor/ResizeControl';
import {
  CodeEditorPanelData,
  MIN_WIDTH_PANEL,
  MIN_WIDTH_VISIBLE_GRID,
} from '@/app/ui/menus/CodeEditor/useCodeEditorPanelData';
import { RefObject } from 'react';

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  codeEditorPanelData: CodeEditorPanelData;
}

const MIN_WIDTH_EDITOR = 350;

export const CodeEditorPanels = (props: Props) => {
  const { containerRef, codeEditorPanelData } = props;
  return (
    <>
      {codeEditorPanelData.panelPosition === 'left' && (
        <>
          {/* left-to-right: height of sections in panel */}
          <ResizeControl
            style={{
              top: codeEditorPanelData.panelHeightPercentage + '%',
              width: codeEditorPanelData.panelWidth + 'px',
            }}
            setState={(mouseEvent) => {
              if (!containerRef.current) return;

              const containerRect = containerRef.current?.getBoundingClientRect();
              const newValue = ((mouseEvent.clientY - containerRect.top) / containerRect.height) * 100;
              if (newValue >= 25 && newValue <= 75) {
                codeEditorPanelData.setPanelHeightPercentage(newValue);
              }
            }}
            position="HORIZONTAL"
          />
          {/* left-to-right: outer edge */}
          <ResizeControl
            style={{ left: `-1px` }}
            setState={(mouseEvent) => {
              const offsetFromRight = window.innerWidth - mouseEvent.x;
              const min = MIN_WIDTH_PANEL + MIN_WIDTH_EDITOR;
              const max = window.innerWidth - MIN_WIDTH_VISIBLE_GRID;

              if (offsetFromRight > min && offsetFromRight < max) {
                // change only the editor width
                let newEditorWidth = offsetFromRight - codeEditorPanelData.panelWidth;
                let newPanelWidth: number | undefined;
                if (newEditorWidth < MIN_WIDTH_EDITOR) {
                  newEditorWidth = MIN_WIDTH_EDITOR;
                  newPanelWidth = offsetFromRight - MIN_WIDTH_EDITOR;
                }
                codeEditorPanelData.setEditorWidth(newEditorWidth);
                if (newPanelWidth) {
                  codeEditorPanelData.setPanelWidth(newPanelWidth);
                }
              }
            }}
            position="VERTICAL"
          />
          {/* left-to-right: middle line */}
          <ResizeControl
            style={{ left: `${codeEditorPanelData.panelWidth}px` }}
            setState={(mouseEvent) => {
              const offsetFromRight = window.innerWidth - mouseEvent.x;
              const totalWidth = codeEditorPanelData.editorWidth + codeEditorPanelData.panelWidth;
              const newEditorWidth = Math.max(offsetFromRight, MIN_WIDTH_EDITOR);
              const newPanelWidth = Math.max(totalWidth - newEditorWidth, MIN_WIDTH_PANEL);

              // don't allow resizing if the total width changes
              if (newEditorWidth + newPanelWidth !== totalWidth) return;

              codeEditorPanelData.setEditorWidth(newEditorWidth);
              codeEditorPanelData.setPanelWidth(newPanelWidth);
            }}
            position="VERTICAL"
          />
        </>
      )}

      {codeEditorPanelData.panelPosition === 'bottom' && (
        <>
          {/* top-to-bottom: editor width */}
          <ResizeControl
            style={{ left: '-1px' }}
            setState={(mouseEvent) => {
              const offsetFromRight = window.innerWidth - mouseEvent.x;
              const min = MIN_WIDTH_EDITOR;
              const max = window.innerWidth - MIN_WIDTH_VISIBLE_GRID;
              const newValue = offsetFromRight > max ? max : offsetFromRight < min ? min : offsetFromRight;
              codeEditorPanelData.setEditorWidth(newValue);
            }}
            position="VERTICAL"
          />
          {/* top-to-bottom: height of sections */}
          <ResizeControl
            style={{ top: codeEditorPanelData.editorHeightPercentage + '%', width: '100%' }}
            setState={(mouseEvent) => {
              if (!containerRef.current) return;

              const containerRect = containerRef.current?.getBoundingClientRect();
              const newTopHeight = ((mouseEvent.clientY - containerRect.top) / containerRect.height) * 100;

              if (newTopHeight >= 25 && newTopHeight <= 75) {
                codeEditorPanelData.setEditorHeightPercentage(newTopHeight);
              }
            }}
            position="HORIZONTAL"
          />
        </>
      )}
    </>
  );
};
