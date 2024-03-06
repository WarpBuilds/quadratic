import { PasteSpecial } from '@/quadratic-core/quadratic_core';
import {
  AttachMoneyOutlined,
  BorderAll,
  ContentPasteGoOutlined,
  ContentPasteSearchOutlined,
  Download,
  FormatAlignCenter,
  FormatAlignLeft,
  FormatAlignRight,
  FormatBold,
  FormatClear,
  FormatColorFill,
  FormatColorText,
  FormatItalic,
  Functions,
  MoreHoriz,
  Percent,
} from '@mui/icons-material';
import { Divider, IconButton, Paper, Toolbar } from '@mui/material';
import { ControlledMenu, Menu, MenuDivider, MenuInstance, MenuItem, useMenuState } from '@szhsin/react-menu';
import mixpanel from 'mixpanel-browser';
import { useCallback, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { downloadSelectionAsCsvAction, hasPermissionToEditFile } from '../../../actions';
import { editorInteractionStateAtom } from '../../../atoms/editorInteractionStateAtom';
import { useGlobalSnackbar } from '../../../components/GlobalSnackbarProvider';
import {
  copySelectionToPNG,
  fullClipboardSupport,
  pasteFromClipboard,
} from '../../../grid/actions/clipboard/clipboard';
import { sheets } from '../../../grid/controller/Sheets';
import { pixiApp } from '../../../gridGL/pixiApp/PixiApp';
import { pixiAppSettings } from '../../../gridGL/pixiApp/PixiAppSettings';
import { focusGrid } from '../../../helpers/focusGrid';
import { KeyboardSymbols } from '../../../helpers/keyboardSymbols';
import { colors } from '../../../theme/colors';
import { useFileContext } from '../../components/FileProvider';
import { TooltipHint } from '../../components/TooltipHint';
import { QColorPicker } from '../../components/qColorPicker';
import { CopyAsPNG, DecimalDecrease, DecimalIncrease, Icon123 } from '../../icons';
import { MenuLineItem } from '../TopBar/MenuLineItem';
import { useGetBorderMenu } from '../TopBar/SubMenus/FormatMenu/useGetBorderMenu';
import {
  clearFormattingAndBorders,
  removeCellNumericFormat,
  setAlignment,
  setBold,
  setFillColor,
  setItalic,
  setTextColor,
  textFormatDecreaseDecimalPlaces,
  textFormatIncreaseDecimalPlaces,
  textFormatSetCurrency,
  textFormatSetExponential,
  textFormatSetPercentage,
} from '../TopBar/SubMenus/formatCells';

interface Props {
  container?: HTMLDivElement;
  showContextMenu: boolean;
}

export const FloatingContextMenu = (props: Props) => {
  const { container, showContextMenu } = props;
  const { addGlobalSnackbar } = useGlobalSnackbar();
  const editorInteractionState = useRecoilValue(editorInteractionStateAtom);
  const [moreMenuProps, moreMenuToggle] = useMenuState();
  const menuDiv = useRef<HTMLDivElement>(null);
  const moreMenuButtonRef = useRef(null);
  const borders = useGetBorderMenu();
  const { name: fileName } = useFileContext();

  const textColorRef = useRef<MenuInstance>(null);
  const fillColorRef = useRef<MenuInstance>(null);

  // close the more menu on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (moreMenuProps.state === 'open' && e.key === 'Escape') {
        moreMenuToggle();
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreMenuProps.state, moreMenuToggle]);

  // Function used to move and scale the Input with the Grid
  const updateContextMenuCSSTransform = useCallback(() => {
    if (!container || !menuDiv.current) return '';

    const { viewport } = pixiApp;

    const sheet = sheets.sheet;
    const cursor = sheet.cursor;

    // Calculate position of input based on cell
    const cell_offsets = sheet.getCellOffsets(
      cursor.multiCursor
        ? Math.min(cursor.cursorPosition.x, cursor.multiCursor.originPosition.x, cursor.multiCursor.terminalPosition.x)
        : cursor.cursorPosition.x,
      cursor.multiCursor
        ? Math.min(cursor.cursorPosition.y, cursor.multiCursor.originPosition.y, cursor.multiCursor.terminalPosition.y)
        : cursor.cursorPosition.y
    );
    let cell_offset_scaled = viewport.toScreen(cell_offsets.x, cell_offsets.y);

    const menuHeight = menuDiv.current?.clientHeight || 0;

    let x = cell_offset_scaled.x + container.offsetLeft - 20;
    let y = cell_offset_scaled.y + container.offsetTop - menuHeight - 20;

    /**
     * Control menu visibility
     */
    let visibility = 'visible';

    // Hide if zoomed out too much
    if (viewport.scale.x < 0.1) {
      visibility = 'hidden';
    }
    // hide if boxCells is active
    if (cursor.boxCells) {
      visibility = 'hidden';
    }

    // Hide if it's not 1) a multicursor or, 2) an active right click
    if (!(cursor.multiCursor || showContextMenu)) visibility = 'hidden';

    // Hide if currently selecting
    if (pixiApp.pointer?.pointerDown?.active) visibility = 'hidden';

    // Hide if in presentation mode
    if (pixiAppSettings.presentationMode) visibility = 'hidden';

    // Hide if you don't have edit access
    if (!hasPermissionToEditFile(editorInteractionState.permissions)) visibility = 'hidden';

    // Hide FloatingFormatMenu if multi cursor is off screen
    const terminal_pos = sheet.getCellOffsets(
      cursor.multiCursor ? cursor.multiCursor.terminalPosition.x : cursor.cursorPosition.x,
      cursor.multiCursor ? cursor.multiCursor.terminalPosition.y : cursor.cursorPosition.y
    );
    let multiselect_offset = viewport.toScreen(
      terminal_pos.x + terminal_pos.width,
      terminal_pos.y + terminal_pos.height
    );
    if (multiselect_offset.x < 0 || multiselect_offset.y < 0) visibility = 'hidden';

    // Hide More menu if changing from visible to hidden
    if (menuDiv.current.style.visibility === 'visible' && visibility === 'hidden') moreMenuToggle(false);

    // Apply visibility
    menuDiv.current.style.visibility = visibility;

    /**
     * Menu positioning
     */

    // if outside of viewport keep it inside
    if (x < container.offsetLeft + 35) {
      x = container.offsetLeft + 35;
    } // left
    if (y < container.offsetTop + 35) {
      y = container.offsetTop + 35;
    } // top

    // Generate transform CSS
    const transform = 'translate(' + [x, y].join('px,') + 'px) ';
    // Update input css matrix
    menuDiv.current.style.transform = transform;

    // Disable pointer events while the viewport is moving
    if (viewport.moving) {
      menuDiv.current.style.pointerEvents = 'none';
      // make sure when we are setting pointer event to none
      // that we check again soon to see if the viewport is done moving
      setTimeout(updateContextMenuCSSTransform, 100);
    } else menuDiv.current.style.pointerEvents = 'auto';
    return transform;
  }, [container, showContextMenu, editorInteractionState.permissions, moreMenuToggle]);

  useEffect(() => {
    const { viewport } = pixiApp;

    if (!viewport) return;
    viewport.on('moved', updateContextMenuCSSTransform);
    viewport.on('moved-end', updateContextMenuCSSTransform);
    document.addEventListener('pointerup', updateContextMenuCSSTransform);
    window.addEventListener('resize', updateContextMenuCSSTransform);
    window.addEventListener('keyup', updateContextMenuCSSTransform);

    return () => {
      viewport.removeListener('moved', updateContextMenuCSSTransform);
      viewport.removeListener('moved-end', updateContextMenuCSSTransform);
      document.removeEventListener('pointerup', updateContextMenuCSSTransform);
      window.removeEventListener('resize', updateContextMenuCSSTransform);
      window.addEventListener('keyup', updateContextMenuCSSTransform);
    };
  }, [updateContextMenuCSSTransform]);

  // set input's initial position correctly
  const transform = updateContextMenuCSSTransform();

  const iconSize = 'small';

  return (
    <Paper
      ref={menuDiv}
      style={{
        display: 'block',
        position: 'absolute',
        top: '0',
        left: '0',
        transformOrigin: '0 0',
        transform,
        pointerEvents: 'auto',
        visibility: 'hidden',
      }}
      elevation={4}
      onClick={(e) => {
        mixpanel.track('[FloatingContextMenu].click');
        e.stopPropagation();
      }}
    >
      <Toolbar
        style={{
          padding: '2px 4px',
          minHeight: '0px',
          color: colors.darkGray,
        }}
      >
        <TooltipHint title="Bold" shortcut={KeyboardSymbols.Command + 'B'}>
          <IconButton
            size="small"
            onClick={() => {
              const formatPrimaryCell = sheets.sheet.getFormatPrimaryCell();
              setBold(!formatPrimaryCell?.bold);
            }}
            color="inherit"
          >
            <FormatBold fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Italic" shortcut={KeyboardSymbols.Command + 'I'}>
          <IconButton
            size="small"
            onClick={() => {
              const formatPrimaryCell = sheets.sheet.getFormatPrimaryCell();
              setItalic(!formatPrimaryCell?.italic);
            }}
            color="inherit"
          >
            <FormatItalic fontSize={iconSize} />
          </IconButton>
        </TooltipHint>
        <Menu
          className="color-picker-submenu"
          instanceRef={textColorRef}
          menuButton={
            <div>
              <TooltipHint title="Text color">
                <IconButton size="small" color="inherit">
                  <FormatColorText fontSize={iconSize} />
                </IconButton>
              </TooltipHint>
            </div>
          }
        >
          <QColorPicker
            onChangeComplete={(color) => {
              textColorRef.current?.closeMenu();
              setTextColor(color);
              focusGrid();
            }}
            onClear={() => {
              textColorRef.current?.closeMenu();
              setTextColor(undefined);
              focusGrid();
            }}
          />
        </Menu>

        <MenuDividerVertical />

        <TooltipHint title="Align left">
          <IconButton size="small" onClick={() => setAlignment('left')}>
            <FormatAlignLeft fontSize={iconSize} />
          </IconButton>
        </TooltipHint>
        <TooltipHint title="Align center">
          <IconButton size="small" onClick={() => setAlignment('center')}>
            <FormatAlignCenter fontSize={iconSize} />
          </IconButton>
        </TooltipHint>
        <TooltipHint title="Align right">
          <IconButton size="small" onClick={() => setAlignment('right')}>
            <FormatAlignRight fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <MenuDividerVertical />

        <Menu
          className="color-picker-submenu"
          instanceRef={fillColorRef}
          menuButton={
            <div>
              <TooltipHint title="Fill color">
                <IconButton size="small" color="inherit">
                  <FormatColorFill fontSize={iconSize} />
                </IconButton>
              </TooltipHint>
            </div>
          }
        >
          <QColorPicker
            onChangeComplete={(color) => {
              fillColorRef.current?.closeMenu();
              setFillColor(color);
              focusGrid();
            }}
            onClear={() => {
              fillColorRef.current?.closeMenu();
              setFillColor(undefined);
              focusGrid();
            }}
          />
        </Menu>
        <Menu
          menuButton={
            <div>
              <TooltipHint title="Borders">
                <IconButton size="small" color="inherit">
                  <BorderAll fontSize={iconSize} />
                </IconButton>
              </TooltipHint>
            </div>
          }
        >
          {borders}
        </Menu>

        <MenuDividerVertical />

        <TooltipHint title="Format as automatic">
          <IconButton size="small" onClick={() => removeCellNumericFormat()} color="inherit">
            <Icon123 fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Format as currency">
          <IconButton size="small" onClick={() => textFormatSetCurrency()} color="inherit">
            <AttachMoneyOutlined fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Format as percentage">
          <IconButton size="small" onClick={() => textFormatSetPercentage()} color="inherit">
            <Percent fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Format as scientific">
          <IconButton size="small" onClick={() => textFormatSetExponential()} color="inherit">
            <Functions fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Decrease decimal places">
          <IconButton size="small" onClick={() => textFormatDecreaseDecimalPlaces()} color="inherit">
            <DecimalDecrease fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <TooltipHint title="Increase decimal places">
          <IconButton size="small" onClick={() => textFormatIncreaseDecimalPlaces()} color="inherit">
            <DecimalIncrease fontSize={iconSize} />
          </IconButton>
        </TooltipHint>

        <MenuDividerVertical />
        <TooltipHint title="Clear formatting" shortcut={KeyboardSymbols.Command + '\\'}>
          <IconButton size="small" onClick={clearFormattingAndBorders} color="inherit">
            <FormatClear fontSize={iconSize} />
          </IconButton>
        </TooltipHint>
        {fullClipboardSupport() && <MenuDividerVertical />}
        {fullClipboardSupport() && (
          <TooltipHint title="More commands…">
            <IconButton size="small" onClick={() => moreMenuToggle()} color="inherit" ref={moreMenuButtonRef}>
              <MoreHoriz fontSize={iconSize} />
            </IconButton>
          </TooltipHint>
        )}
        <ControlledMenu
          state={moreMenuProps.state}
          menuStyle={{ padding: '2px 0', color: 'inherit' }}
          anchorRef={moreMenuButtonRef}
        >
          <MenuItem
            onClick={() => {
              pasteFromClipboard(PasteSpecial.Values);
              moreMenuToggle();
            }}
          >
            <MenuLineItem
              primary="Paste values only"
              secondary={KeyboardSymbols.Command + KeyboardSymbols.Shift + 'V'}
              Icon={ContentPasteGoOutlined}
            />
          </MenuItem>
          <MenuItem
            onClick={() => {
              pasteFromClipboard(PasteSpecial.Formats);
              moreMenuToggle();
            }}
          >
            <MenuLineItem primary="Paste formatting only" Icon={ContentPasteSearchOutlined} />
          </MenuItem>
          <MenuDivider />
          <MenuItem
            onClick={async () => {
              await copySelectionToPNG(addGlobalSnackbar);
              moreMenuToggle();
            }}
          >
            <MenuLineItem
              primary="Copy selection as PNG"
              secondary={KeyboardSymbols.Command + KeyboardSymbols.Shift + 'C'}
              Icon={CopyAsPNG}
            ></MenuLineItem>
          </MenuItem>
          <MenuItem
            onClick={() => {
              downloadSelectionAsCsvAction.run({ fileName });
              moreMenuToggle();
            }}
          >
            <MenuLineItem
              primary={downloadSelectionAsCsvAction.label}
              secondary={KeyboardSymbols.Command + KeyboardSymbols.Shift + 'E'}
              Icon={Download}
            ></MenuLineItem>
          </MenuItem>
        </ControlledMenu>
      </Toolbar>
    </Paper>
  );
};

function MenuDividerVertical() {
  return (
    <Divider
      orientation="vertical"
      flexItem
      style={{
        margin: '4px',
      }}
    />
  );
}
