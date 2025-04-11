import { QuadraticLoading } from '@/app/ui/loading/QuadraticLoading';
import type { User } from '@/auth/auth';
import { authClient } from '@/auth/auth';
import { ConfirmProvider } from '@/shared/components/ConfirmProvider';
import { Empty } from '@/shared/components/Empty';
import { GlobalSnackbarProvider } from '@/shared/components/GlobalSnackbarProvider';
import { MuiTheme } from '@/shared/components/MuiTheme';
import { ShowAfter } from '@/shared/components/ShowAfter';
import { ROUTE_LOADER_IDS } from '@/shared/constants/routes';
import { ThemeAccentColorEffects } from '@/shared/hooks/useThemeAccentColor';
import { ThemeAppearanceModeEffects } from '@/shared/hooks/useThemeAppearanceMode';
import { initializeAnalytics } from '@/shared/utils/analytics';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import * as Sentry from '@sentry/react';
import type { LoaderFunctionArgs } from 'react-router-dom';
import { Outlet, useRouteError, useRouteLoaderData } from 'react-router-dom';

export type RootLoaderData = {
  isAuthenticated: boolean;
  loggedInUser?: User;
};

export const useRootRouteLoaderData = () => useRouteLoaderData(ROUTE_LOADER_IDS.ROOT) as RootLoaderData;

export const loader = async ({ request, params }: LoaderFunctionArgs): Promise<RootLoaderData | Response> => {
  // All other routes get the same data
  const isAuthenticated = await authClient.isAuthenticated();
  const user = await authClient.user();

  initializeAnalytics(user);

  return { isAuthenticated, loggedInUser: user };
};

export const Component = () => {
  return (
    <MuiTheme>
      <GlobalSnackbarProvider>
        <ConfirmProvider>
          <>
            <Outlet />
            <ThemeAppearanceModeEffects />
            <ThemeAccentColorEffects />
          </>
        </ConfirmProvider>
      </GlobalSnackbarProvider>
    </MuiTheme>
  );
};

export const HydrateFallback = () => {
  return (
    <ShowAfter delay={2000}>
      <QuadraticLoading />
    </ShowAfter>
  );
};

export const ErrorBoundary = () => {
  let error = useRouteError();
  console.error(error);

  Sentry.captureException({
    message: `RootRoute error element triggered. ${error}`,
  });

  return (
    <Empty
      title="Something went wrong"
      description="An unexpected error occurred. Try reloading the page or contact us if the error continues."
      Icon={ExclamationTriangleIcon}
      severity="error"
      error={error}
    />
  );
};
