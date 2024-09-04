import { connectionClient } from '@/shared/api/connectionClient';
import mixpanel from 'mixpanel-browser';
import { useEffect } from 'react';
import { useFetcher } from 'react-router-dom';

type SchemaData = Awaited<ReturnType<typeof connectionClient.schemas.get>>;

/**
 * Anywhere we want to access the data for the connection schema, we use this hook.
 * It uses the connection UUID as the fetcher key, so the data persists on the
 * fetcher across multiple renders and different connections.
 *
 * This is primarily useful when you’re using this inside of the app (for example,
 * the AI assistant needs to know the connection schema).
 *
 * Because it’s used this way, the props can be undefined because in the app
 * we may be dealing with a cell that is not a connection. Or the connection
 * no longer exists, even though it's in the file.
 */
export const useConnectionSchemaBrowser = ({ type, uuid }: { uuid: string | undefined; type: string | undefined }) => {
  const fetcher = useFetcher<{ ok: boolean; data: SchemaData }>({
    key: uuid ? `SCHEMA_FOR_CONNECTION_${uuid}` : undefined,
  });

  const fetcherUrl = uuid && type ? `/api/connections/${uuid}/schema/${type?.toLowerCase()}` : '';

  useEffect(() => {
    // Don’t bother fetching anything if we don't have the connection
    // (this hook runs on cells like python that aren't connections)
    if (!fetcherUrl) return;

    // Otherwise, fetch the schema data if we don't have it yet
    if (fetcher.state === 'idle' && fetcher.data === undefined) {
      fetcher.load(fetcherUrl);
    }
  }, [fetcher, fetcherUrl]);

  const reloadSchema = () => {
    mixpanel.track('[Connections].schemaViewer.refresh');
    fetcher.load(fetcherUrl);
  };

  return {
    // undefined = hasn't loaded yet, null = error, otherwise the data
    data: fetcher.data === undefined ? undefined : fetcher.data.ok ? fetcher.data.data : null,
    isLoading: fetcher.state !== 'idle',
    reloadSchema,
  };
};
