import { useRootRouteLoaderData } from '@/router';
import { KeyboardArrowDown } from '@mui/icons-material';
import { IconButton, useTheme } from '@mui/material';
import { Menu, MenuDivider, MenuItem } from '@szhsin/react-menu';
import { Dispatch, SetStateAction } from 'react';
import { useParams, useSubmit } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { deleteFile, downloadFileAction, duplicateFileWithUserAsOwnerAction, renameFileAction } from '../../../actions';
import { editorInteractionStateAtom } from '../../../atoms/editorInteractionStateAtom';
import { useGlobalSnackbar } from '../../../components/GlobalSnackbarProvider';
import { useFileContext } from '../../components/FileProvider';
import { MenuLineItem } from './MenuLineItem';

export function TopBarFileMenuDropdown({ setIsRenaming }: { setIsRenaming: Dispatch<SetStateAction<boolean>> }) {
  const theme = useTheme();
  const { name } = useFileContext();
  const editorInteractionState = useRecoilValue(editorInteractionStateAtom);
  const { uuid } = useParams() as { uuid: string };
  const submit = useSubmit();
  const { addGlobalSnackbar } = useGlobalSnackbar();
  const { isAuthenticated } = useRootRouteLoaderData();
  const { permissions } = editorInteractionState;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Menu
      menuButton={({ open }) => (
        <IconButton
          id="file-name-button"
          aria-controls={open ? 'basic-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          size="small"
          disableRipple
          sx={{
            marginLeft: theme.spacing(-0.5),
            fontSize: '1rem',
            ...(open
              ? {
                  backgroundColor: theme.palette.action.hover,
                  '& svg': { transform: 'translateY(1px)' },
                }
              : {}),
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
            '&:hover svg': {
              transform: 'translateY(1px)',
            },
          }}
        >
          <KeyboardArrowDown fontSize="inherit" sx={{ transition: '.2s ease transform' }} />
        </IconButton>
      )}
    >
      {renameFileAction.isAvailable(permissions) && (
        <MenuItem
          onClick={() => {
            setIsRenaming(true);
          }}
        >
          <MenuLineItem primary={renameFileAction.label} />
        </MenuItem>
      )}
      {duplicateFileWithUserAsOwnerAction.isAvailable(permissions, isAuthenticated) && (
        <MenuItem onClick={() => duplicateFileWithUserAsOwnerAction.run({ uuid, submit })}>
          <MenuLineItem primary={duplicateFileWithUserAsOwnerAction.label} />
        </MenuItem>
      )}
      {downloadFileAction.isAvailable(permissions, isAuthenticated) && (
        <MenuItem
          onClick={() => {
            downloadFileAction.run({ name });
          }}
        >
          <MenuLineItem primary={downloadFileAction.label} />
        </MenuItem>
      )}
      {deleteFile.isAvailable(permissions) && (
        <>
          <MenuDivider />
          <MenuItem
            onClick={async () => {
              deleteFile.run({ uuid, addGlobalSnackbar });
            }}
          >
            <MenuLineItem primary={deleteFile.label} />
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
