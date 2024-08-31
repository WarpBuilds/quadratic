import { Input } from '@/shared/shadcn/ui/input';
import { Label } from '@/shared/shadcn/ui/label';
import { TooltipHint } from './TooltipHint';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import { Button } from '@/shared/shadcn/ui/button';
import { FocusEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getSelectionString, parseSelectionString } from '@/app/grid/sheet/selection';
import { sheets } from '@/app/grid/controller/Sheets';
import { cn } from '@/shared/shadcn/utils';
import { Selection } from '@/app/quadratic-core-types';
import { events } from '@/app/events/events';

interface Props {
  label?: string;
  initial?: Selection;
  onChangeSelection: (selection: Selection | undefined) => void;

  // used to trigger an error if the range is empty
  triggerError?: boolean;

  // used to update the sheet's cursor to the range. If string, then it uses the
  // string as the sheetId; otherwise it uses sheets.sheet.id as the sheetId
  changeCursor?: string | true;

  readOnly?: boolean;

  onEnter?: () => void;

  requireSheetId?: string;
}

export const SheetRange = (props: Props) => {
  const {
    onChangeSelection: onChangeRange,
    label,
    initial,
    triggerError,
    changeCursor,
    readOnly,
    requireSheetId,
  } = props;
  const [rangeError, setRangeError] = useState<string | undefined>();
  const ref = useRef<HTMLInputElement>(null);

  // insert the range of the current selection
  const onInsert = useCallback(() => {
    if (ref.current) {
      const selection = sheets.getRustSelection();
      ref.current.value = getSelectionString(selection);
      onChangeRange(selection);
      setRangeError(undefined);
    }
  }, [onChangeRange]);

  const updateValue = useCallback(
    (value: string) => {
      const selection = parseSelectionString(value, sheets.sheet.id);
      if (selection.selection) {
        onChangeRange(selection.selection);
        setRangeError(undefined);
      } else if (selection.error) {
        onChangeRange(undefined);
        setRangeError(selection.error.error);
      } else {
        throw new Error('Invalid selection from parseSelectionRange');
      }
    },
    [onChangeRange]
  );

  const onBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const value = e.currentTarget.value;
      updateValue(value);
    },
    [updateValue]
  );

  useEffect(() => {
    if (ref.current) {
      ref.current.value = initial ? getSelectionString(initial) : '';
    }
  }, [initial]);

  const onFocus = () => {
    if (!ref.current || !changeCursor) return;
    const selection = parseSelectionString(ref.current.value, changeCursor === true ? sheets.sheet.id : changeCursor);
    if (selection.selection) {
      // we need to hack the cursorPosition :(
      const rects = selection.selection.rects;
      if (rects?.length) {
        selection.selection.x = rects[0].min.x;
        selection.selection.y = rects[0].min.y;
      }
      sheets.sheet.cursor.loadFromSelection(selection.selection, true);
    }
  };

  const isError = triggerError && (!ref.current || ref.current.value === '');

  const [sheetId, setSheetId] = useState(sheets.sheet.id);
  useEffect(() => {
    const updateSheet = () => setSheetId(sheets.sheet.id);
    events.on('changeSheet', updateSheet);
    return () => {
      events.off('changeSheet', updateSheet);
    };
  }, []);
  const disableButton = requireSheetId ? requireSheetId !== sheetId : false;

  return (
    <div>
      {props.label && <Label htmlFor={label}>{label}</Label>}
      <div className="flex w-full items-center space-x-2">
        <div className={cn('w-full', rangeError || isError ? 'border border-red-500' : '')}>
          <Input
            ref={ref}
            id={props.label}
            onBlur={onBlur}
            onFocus={onFocus}
            readOnly={readOnly}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && props.onEnter) {
                updateValue(e.currentTarget.value);
                props.onEnter();
              }
            }}
          />
        </div>
        {!readOnly && (
          <TooltipHint
            title={disableButton ? 'Can only insert from original sheet' : 'Insert current selection'}
            placement="bottom"
          >
            <span>
              <Button size="sm" onClick={onInsert} disabled={disableButton}>
                <HighlightAltIcon fontSize="small" />
              </Button>
            </span>
          </TooltipHint>
        )}
      </div>
      {rangeError && <div className="text-xs text-red-500">{rangeError}</div>}
      {!rangeError && isError && <div className="text-xs text-red-500">Empty range</div>}
    </div>
  );
};
