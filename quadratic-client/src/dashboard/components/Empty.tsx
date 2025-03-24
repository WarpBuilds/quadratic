import { useRootRouteLoaderData } from '@/routes/_root';
import { Avatar } from '@/shared/components/Avatar';
import { TYPE } from '@/shared/constants/appConstants';
import { ROUTES } from '@/shared/constants/routes';
import { Button } from '@/shared/shadcn/ui/button';
import { cn } from '@/shared/shadcn/utils';
import type { IconProps } from '@radix-ui/react-icons/dist/types';
import * as Sentry from '@sentry/react';
import mixpanel from 'mixpanel-browser';
import { useEffect } from 'react';
import { useSubmit } from 'react-router-dom';

export function Empty({
  title,
  description,
  actions,
  Icon,
  severity,
  className,
  showLoggedInUser,
  error,
}: {
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  Icon: React.ForwardRefExoticComponent<IconProps>;
  severity?: 'error';
  className?: string;
  showLoggedInUser?: boolean;
  error?: unknown;
}) {
  const { loggedInUser } = useRootRouteLoaderData();
  const submit = useSubmit();

  useEffect(() => {
    if (severity === 'error' || error) {
      mixpanel.track('[Empty].error', {
        title,
        description,
      });
      Sentry.captureException(new Error('error-page'), {
        extra: {
          title,
          description,
          error,
        },
      });
    }
  }, [severity, error, title, description]);

  return (
    <div className={cn(`max-w mx-auto my-10 max-w-md px-2 text-center`, className)}>
      <div
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-border text-muted-foreground`}
      >
        <Icon className={cn(`h-[30px] w-[30px]`, severity === 'error' && 'text-destructive')} />
      </div>
      <h4 className={cn(TYPE.h4, `mb-1`, severity === 'error' && 'text-destructive')}>{title}</h4>

      <div className={`text-sm text-muted-foreground`}>{description}</div>

      {actions && <div className={`mt-8`}>{actions}</div>}
      {showLoggedInUser && loggedInUser && (
        <div className="mx-auto mt-12 max-w-96 border-t border-border pt-2">
          <div className="mx-auto flex items-center gap-2 rounded-md pt-2 text-left text-sm">
            <Avatar src={loggedInUser.picture} alt={`Avatar for ${loggedInUser.name}`} className="flex-shrink-0">
              {loggedInUser.name}
            </Avatar>
            <div className="flex flex-col justify-start truncate">
              {loggedInUser.name}
              <span className="text-xs text-muted-foreground">{loggedInUser.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => submit('', { method: 'POST', action: ROUTES.LOGOUT })}
            >
              Logout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
