import { apiClient } from '@/shared/api/apiClient';
import { Type } from '@/shared/components/Type';
import { ROUTES } from '@/shared/constants/routes';
import { DOCUMENTATION_URL } from '@/shared/constants/urls';
import { Button } from '@/shared/shadcn/ui/button';
import { cn } from '@/shared/shadcn/utils';
import { Box, useTheme } from '@mui/material';
import { ExclamationTriangleIcon, ExternalLinkIcon, FileIcon } from '@radix-ui/react-icons';
import mixpanel from 'mixpanel-browser';
import { FilePermission } from 'quadratic-shared/typesAndSchemas';
import { Link, LoaderFunctionArgs, useLoaderData, useRouteError } from 'react-router-dom';
import { debugShowUILogs } from '../app/debugFlags';
import CreateFileButton from '../dashboard/components/CreateFileButton';
import { DashboardHeader } from '../dashboard/components/DashboardHeader';
import { Empty } from '../dashboard/components/Empty';
import { FilesList, FilesListUserFile } from '../dashboard/components/FilesList';

export const loader = async ({ request }: LoaderFunctionArgs): Promise<FilesListUserFile[]> => {
  const files = await apiClient.files.list();
  const permissions = ['FILE_VIEW', 'FILE_EDIT', 'FILE_DELETE'] as FilePermission[];
  const filesWithPermissions = files.map(({ name, uuid, createdDate, updatedDate, publicLinkAccess, thumbnail }) => ({
    name,
    thumbnail,
    createdDate,
    updatedDate,
    uuid,
    publicLinkAccess,
    permissions,
  }));
  return filesWithPermissions;
};

export const Component = () => {
  const files = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  return (
    <>
      <DashboardHeader title="My files" actions={<CreateFileButton />} />
      <FilesList
        files={files}
        emptyState={
          <Empty
            className="max-w-xl"
            title="No files"
            description={<>You don’t have any files, but you can create one below.</>}
            Icon={FileIcon}
            actions={
              <div>
                {[
                  {
                    title: 'Learn the basics',
                    description: 'With an instructional walk-through',
                    link: (
                      <Link
                        to={ROUTES.CREATE_FILE_EXAMPLE(
                          'https://app.quadratichq.com/file/abb7cb2f-2cc7-46bb-9c83-a86f0c8d4834'
                        )}
                        reloadDocument
                        onClick={() => {
                          mixpanel.track('[FilesEmptyState].clickOpenStarterFile');
                        }}
                      >
                        Open starter file
                      </Link>
                    ),
                    className: 'border border-primary bg-yellow-5000',
                  },
                  {
                    title: 'Get started',
                    description: 'With a fresh new file',
                    link: (
                      <Link
                        to={ROUTES.CREATE_FILE}
                        reloadDocument
                        onClick={() => {
                          mixpanel.track('[FilesEmptyState].clickCreateBlankFile');
                        }}
                      >
                        Create blank file
                      </Link>
                    ),
                    className: 'border-b border-border',
                  },
                  {
                    title: 'See what’s possible',
                    description: 'Like filtering and fetching data',
                    link: (
                      <Link
                        to={ROUTES.EXAMPLES}
                        onClick={() => {
                          mixpanel.track('[FilesEmptyState].clickExploreExamples');
                        }}
                      >
                        Explore examples
                      </Link>
                    ),
                    className: 'border-b border-border',
                  },
                  {
                    title: 'Deep dive',
                    description: 'All the details of using the app',
                    link: (
                      <Link
                        to={DOCUMENTATION_URL}
                        target="_blank"
                        onClick={() => {
                          mixpanel.track('[FilesEmptyState].clickReadDocs');
                        }}
                      >
                        Read the docs
                        <ExternalLinkIcon className="ml-2" />
                      </Link>
                    ),
                  },
                ].map(({ title, description, link, className }, i) => (
                  <div
                    key={i}
                    className={cn(`p-3 text-center sm:flex sm:items-center sm:justify-between sm:text-left`, className)}
                  >
                    <div className="mb-2 flex flex-col sm:mb-0">
                      <Type as="h2" className="font-semibold">
                        {title}
                      </Type>
                      <Type as="p" className={`text-muted-foreground`}>
                        {description}
                      </Type>
                    </div>

                    <Button asChild variant="secondary">
                      {link}
                    </Button>
                  </div>
                ))}
              </div>
            }
          />
        }
      />
    </>
  );
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  const theme = useTheme();

  if (debugShowUILogs) console.error('[<MineRoute>.<ErrorBoundary>]', error);

  return (
    <Box sx={{ maxWidth: '60ch', mx: 'auto', py: theme.spacing(2) }}>
      <Empty
        title="Unexpected error"
        description="An unexpected error occurred while retrieving your files. Try reloading the page. If the issue continues, contact us."
        Icon={ExclamationTriangleIcon}
        severity="error"
      />
    </Box>
  );
};
