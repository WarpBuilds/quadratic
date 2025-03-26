import type { User } from '@/auth/auth';
import { authClient } from '@/auth/auth';
import { Empty } from '@/dashboard/components/Empty';
import { GlobalSnackbarProvider } from '@/shared/components/GlobalSnackbarProvider';
import { MuiTheme } from '@/shared/components/MuiTheme';
import { ROUTE_LOADER_IDS } from '@/shared/constants/routes';
import { ThemeAccentColorEffects } from '@/shared/hooks/useThemeAccentColor';
import { ThemeAppearanceModeEffects } from '@/shared/hooks/useThemeAppearanceMode';
import { initializeAnalytics } from '@/shared/utils/analytics';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { Outlet, useRouteError, useRouteLoaderData } from 'react-router';

export type RootLoaderData = {
  isAuthenticated: boolean;
  loggedInUser?: User;
};

export const useRootRouteLoaderData = () => useRouteLoaderData(ROUTE_LOADER_IDS.ROOT) as RootLoaderData;

export const clientLoader = async ({ request, params }: LoaderFunctionArgs): Promise<RootLoaderData | Response> => {
  // All other routes get the same data
  const isAuthenticated = await authClient.isAuthenticated();
  const user = await authClient.user();

  initializeAnalytics(user);

  return { isAuthenticated, loggedInUser: user };
};

export default function Component() {
  // Prevent window zooming on Chrome
  // https://stackoverflow.com/questions/61114830/how-to-prevent-native-browser-default-pinch-to-zoom-behavior
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        return;
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.addEventListener('wheel', handleWheel, { passive: false });
    };
  }, []);

  return (
    <MuiTheme>
      <GlobalSnackbarProvider>
        <>
          <Outlet />
          <ThemeAppearanceModeEffects />
          <ThemeAccentColorEffects />
        </>
      </GlobalSnackbarProvider>
    </MuiTheme>
  );
}

// TODO: put this in root
// export const HydrateFallback = () => {
//   return (
//     <ShowAfter delay={2000}>
//       <QuadraticLoading />
//     </ShowAfter>
//   );
// };

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
