import { isCsv, isExcel, isGrid, isParquet, stripExtension } from '@/helpers/files';
import { Button } from '@/shadcn/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shadcn/ui/dropdown-menu';
import { CaretDownIcon } from '@radix-ui/react-icons';
import mixpanel from 'mixpanel-browser';
import { ChangeEvent, useState } from 'react';
import { Link, useParams, useSubmit } from 'react-router-dom';
import { useGlobalSnackbar } from '../../components/GlobalSnackbarProvider';
import { ROUTES } from '../../constants/routes';
import { importExcel } from '../../grid/controller/Grid';
import { validateAndUpgradeGridFile } from '../../schemas/validateAndUpgradeGridFile';

export type UploadFileType = 'grid' | 'excel' | 'csv' | 'parquet';

const getFileType = (file: File): UploadFileType => {
  if (isGrid(file)) return 'grid';
  if (isExcel(file)) return 'excel';
  if (isCsv(file)) return 'csv';
  if (isParquet(file)) return 'parquet';

  throw new Error(`Unsupported file type: ${file}`);
};

// TODO this will need props when it becomes a button that can be used
// on the team page as well as the user's files page
export default function CreateFileButton() {
  const [open, onOpenChange] = useState<boolean>(false);
  const { addGlobalSnackbar } = useGlobalSnackbar();
  const submit = useSubmit();
  const { uuid } = useParams();
  const actionUrl = uuid ? ROUTES.CREATE_FILE_IN_TEAM(uuid) : ROUTES.CREATE_FILE;

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    // If nothing was selected, just exit
    if (!e.target.files) return;

    try {
      // Get the file and it's contents
      const file: File = e.target.files[0];
      let data;

      switch (getFileType(file)) {
        case 'grid':
          mixpanel.track('[Files].importGrid', { fileName: file.name });
          const contents = await file.text().catch((e) => null);

          // Ensure it's a valid Quadratic grid file
          const validFile = await validateAndUpgradeGridFile(contents);
          if (!validFile) {
            addGlobalSnackbar('Import failed: invalid `.grid` file.', { severity: 'error' });
            return;
          }

          data = {
            name: file.name ? stripExtension(file.name) : 'Untitled',
            version: validFile.version,
            contents: validFile.version === '1.3' ? JSON.stringify(validFile) : validFile.contents,
          };
          break;

        case 'excel':
          mixpanel.track('[Files].importExcel', { fileName: file.name });
          const importedFile = await importExcel(file, addGlobalSnackbar);

          if (importedFile) {
            data = {
              name: file.name ? stripExtension(file.name) : 'Untitled',
              version: importedFile.version,
              contents: importedFile.contents,
            };
          }
          break;

        // TODO(ddimaira): implement these
        case 'csv':
        case 'parquet':
        default:
          addGlobalSnackbar('Import failed: unsupported file type.', { severity: 'warning' });
      }

      // Upload it
      if (data) {
        submit(data, { method: 'POST', action: actionUrl, encType: 'application/json' });
      }
    } catch (e) {
      if (e instanceof Error) addGlobalSnackbar(e.message, { severity: 'warning' });
    }

    // Reset the input so we can add the same file
    e.target.value = '';
  };

  const DropDownButton = (props: { extension: string; name: string }): JSX.Element => {
    const { name, extension } = props;

    return (
      <DropdownMenuItem
        asChild
        onSelect={(e) => {
          // We have to prevent this (and handle the `open` state manually)
          // or the file input's onChange handler won't work properly
          e.preventDefault();
        }}
      >
        <label className="flex cursor-pointer justify-between gap-4">
          {name} <span className="mx-1 font-mono text-xs text-muted-foreground">.{extension}</span>
          <input
            type="file"
            name="content"
            accept={`.${extension}`}
            onChange={(e) => {
              onOpenChange(false);
              handleImport(e);
            }}
            hidden
          />
        </label>
      </DropdownMenuItem>
    );
  };

  return (
    <div className="flex gap-2">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Import file <CaretDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropDownButton name="Quadratic" extension="grid" />
          <DropDownButton name="Excel" extension="xlsx" />
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild>
        <Link to={actionUrl}>Create file</Link>
      </Button>
    </div>
  );
}
