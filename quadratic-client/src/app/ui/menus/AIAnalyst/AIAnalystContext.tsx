import {
  aiAnalystCurrentChatMessagesAtom,
  aiAnalystCurrentChatMessagesCountAtom,
  aiAnalystLoadingAtom,
} from '@/app/atoms/aiAnalystAtom';
import { events } from '@/app/events/events';
import { sheets } from '@/app/grid/controller/Sheets';
import { A1SelectionStringToSelection } from '@/app/quadratic-rust-client/quadratic_rust_client';
import { AIAnalystSelectContextMenu } from '@/app/ui/menus/AIAnalyst/AIAnalystSelectContextMenu';
import { defaultAIAnalystContext } from '@/app/ui/menus/AIAnalyst/const/defaultAIAnalystContext';
import { CloseIcon } from '@/shared/components/Icons';
import { Button } from '@/shared/shadcn/ui/button';
import { cn } from '@/shared/shadcn/utils';
import type { Context, FileContent, UserMessagePrompt } from 'quadratic-shared/typesAndSchemasAI';
import { memo, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';

type AIAnalystContextProps = {
  initialContext?: Context;
  context: Context;
  setContext: React.Dispatch<React.SetStateAction<Context>>;
  files: FileContent[];
  setFiles: React.Dispatch<React.SetStateAction<FileContent[]>>;
  editing: boolean;
  disabled: boolean;
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>;
};

export const AIAnalystContext = memo(
  ({ initialContext, context, setContext, files, setFiles, editing, disabled, textAreaRef }: AIAnalystContextProps) => {
    const loading = useRecoilValue(aiAnalystLoadingAtom);
    const messages = useRecoilValue(aiAnalystCurrentChatMessagesAtom);
    const messagesCount = useRecoilValue(aiAnalystCurrentChatMessagesCountAtom);
    const [, setCurrentSheet] = useState(sheets.sheet.name);

    useEffect(() => {
      if (!editing) return;
      const updateSelection = () => {
        setContext((prev) => ({
          ...prev,
          selection: sheets.sheet.cursor.save(),
        }));
      };
      updateSelection();

      events.on('cursorPosition', updateSelection);
      events.on('changeSheet', updateSelection);
      return () => {
        events.off('cursorPosition', updateSelection);
        events.off('changeSheet', updateSelection);
      };
    }, [editing, setContext]);

    useEffect(() => {
      const updateCurrentSheet = () => {
        if (editing) {
          setContext((prev) => ({
            ...prev,
            currentSheet: sheets.sheet.name,
          }));
        }
        setCurrentSheet(sheets.sheet.name);
      };

      updateCurrentSheet();

      events.on('changeSheet', updateCurrentSheet);
      return () => {
        events.off('changeSheet', updateCurrentSheet);
      };
    }, [editing, setContext]);

    // use last user message context as initial context in the bottom user message form
    useEffect(() => {
      if (initialContext === undefined && messagesCount > 0) {
        const lastUserMessage = messages
          .filter(
            (message): message is UserMessagePrompt => message.role === 'user' && message.contextType === 'userPrompt'
          )
          .at(-1);
        if (lastUserMessage) {
          setContext(lastUserMessage.context ?? defaultAIAnalystContext);
        }
      }
    }, [initialContext, messages, messagesCount, setContext]);

    return (
      <div
        className={cn(
          `z-10 ml-2 flex select-none flex-wrap items-center gap-1 text-xs`,
          disabled && 'select-none',
          loading && 'select-none opacity-60'
        )}
      >
        {editing && (
          <AIAnalystSelectContextMenu
            context={context}
            setContext={setContext}
            disabled={disabled}
            onClose={() => textAreaRef.current?.focus()}
          />
        )}

        {files.map((file, index) => (
          <ContextPill
            key={`${index}-${file.fileName}`}
            primary={file.fileName}
            secondary=""
            disabled={disabled}
            onClick={() => setFiles(files.filter((f) => f !== file))}
          />
        ))}

        <ContextPill
          key="cursor"
          primary={
            context.selection
              ? A1SelectionStringToSelection(context.selection, sheets.a1Context).toA1String(sheets.current)
              : sheets.sheet.cursor.toCursorA1()
          }
          secondary="Cursor"
          onClick={() => setContext((prev) => ({ ...prev, selection: undefined }))}
          disabled={disabled || !context.selection}
        />

        {!!context.currentSheet && (
          <ContextPill
            key={context.currentSheet}
            primary={context.currentSheet}
            secondary={'Sheet'}
            onClick={() =>
              setContext((prev) => ({
                ...prev,
                sheets: prev.sheets.filter((sheet) => sheet !== prev.currentSheet),
                currentSheet: '',
              }))
            }
            disabled={disabled}
          />
        )}

        {context.sheets
          .filter((sheet) => sheet !== context.currentSheet)
          .map((sheet) => (
            <ContextPill
              key={sheet}
              primary={sheet}
              secondary={'Sheet'}
              disabled={disabled}
              onClick={() =>
                setContext((prev) => ({
                  ...prev,
                  sheets: prev.sheets.filter((prevSheet) => prevSheet !== sheet),
                  currentSheet: prev.currentSheet === sheet ? '' : prev.currentSheet,
                }))
              }
            />
          ))}
      </div>
    );
  }
);

const ContextPill = memo(
  ({
    primary,
    secondary,
    onClick,
    disabled,
  }: {
    primary: string;
    secondary: string;
    onClick: () => void;
    disabled: boolean;
  }) => {
    return (
      <div className="flex h-5 items-center self-stretch rounded border border-border px-1 text-xs">
        <span className="max-w-32 truncate">{primary}</span>

        <span className="ml-0.5 text-muted-foreground">{secondary}</span>

        {!disabled && (
          <Button
            size="icon-sm"
            className="-mr-0.5 ml-0 h-4 w-4 items-center shadow-none"
            variant="ghost"
            onClick={onClick}
          >
            <CloseIcon className="!h-4 !w-4 !text-xs" />
          </Button>
        )}
      </div>
    );
  }
);
