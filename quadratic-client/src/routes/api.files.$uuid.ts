import { aiAnalystOfflineChats } from '@/app/ai/offline/aiAnalystChats';
import { apiClient } from '@/shared/api/apiClient';
import { ROUTES } from '@/shared/constants/routes';
import { updateRecentFiles } from '@/shared/utils/updateRecentFiles';
import type { ActionFunctionArgs } from 'react-router-dom';
import { redirectDocument } from 'react-router-dom';

export const loader = async () => null;

export type Action = {
  response: Action['response.duplicate'] | { ok: boolean } | null;
  'response.duplicate': { ok: boolean; uuid: string };
  'request.delete': ReturnType<typeof getActionFileDelete>;
  'request.download': ReturnType<typeof getActionFileDownload>;
  'request.duplicate': ReturnType<typeof getActionFileDuplicate>;
  'request.move': ReturnType<typeof getActionFileMove>;
  'request.rename': {
    action: 'rename';
    name: string;
  };
  request:
    | Action['request.delete']
    | Action['request.download']
    | Action['request.duplicate']
    | Action['request.move']
    | Action['request.rename'];
};

export const action = async ({ params, request }: ActionFunctionArgs): Promise<Action['response']> => {
  const json: Action['request'] = await request.json();
  const { uuid } = params as { uuid: string };
  const { action } = json;

  if (action === 'delete') {
    try {
      const { userEmail, redirect } = json;
      await Promise.all([aiAnalystOfflineChats.deleteFile(userEmail, uuid), apiClient.files.delete(uuid)]);
      updateRecentFiles(uuid, '', false);
      return redirect ? redirectDocument('/') : { ok: true };
    } catch (error) {
      return { ok: false };
    }
  }

  if (action === 'download') {
    try {
      const { checkpointUrl } = json as Action['request.download'];
      await apiClient.files.download(uuid, { checkpointUrl });
      return { ok: true };
    } catch (error) {
      return { ok: false };
    }
  }

  if (action === 'duplicate') {
    try {
      const { redirect, isPrivate, checkpointDataUrl, checkpointVersion } = json as Action['request.duplicate'];
      const checkpoint =
        checkpointDataUrl && checkpointVersion ? { dataUrl: checkpointDataUrl, version: checkpointVersion } : undefined;
      const { uuid: newFileUuid } = await apiClient.files.duplicate(uuid, { isPrivate, checkpoint });
      return redirect ? redirectDocument(ROUTES.FILE(newFileUuid)) : { ok: true, uuid: newFileUuid };
    } catch (error) {
      return { ok: false };
    }
  }

  if (action === 'rename') {
    try {
      const { name } = json as Action['request.rename'];
      await apiClient.files.update(uuid, { name });
      updateRecentFiles(uuid, name, true, true);
      return { ok: true };
    } catch (error) {
      return { ok: false };
    }
  }

  if (action === 'move') {
    try {
      const { ownerUserId } = json as Action['request.move'];
      await apiClient.files.update(uuid, { ownerUserId });
      return { ok: true };
    } catch (error) {
      return { ok: false };
    }
  }

  return null;
};

/**
 * @param ownerUserId - The ID of the user where you want to move the file
 * (as a private file on the team). `null` moves it to the team's public files.
 * @returns
 */
export const getActionFileMove = (ownerUserId: number | null) => {
  return {
    action: 'move' as const,
    ownerUserId,
  };
};

/**
 * @param {Object} args
 * @param {boolean} args.redirect - Whether to redirect the user to the new file after duplication
 * @param {boolean} args.isPrivate - Whether the file is private to the user on the team where its created
 * @returns
 */
export const getActionFileDuplicate = ({
  isPrivate,
  redirect,
  checkpointDataUrl,
  checkpointVersion,
}: {
  isPrivate: boolean;
  redirect: boolean;
  checkpointDataUrl?: string;
  checkpointVersion?: string;
}) => {
  return {
    action: 'duplicate' as const,
    isPrivate,
    redirect,
    ...(checkpointDataUrl ? { checkpointDataUrl } : {}),
    ...(checkpointVersion ? { checkpointVersion } : {}),
  };
};

export const getActionFileDelete = ({ userEmail, redirect }: { userEmail: string; redirect: boolean }) => {
  return {
    action: 'delete' as const,
    userEmail,
    redirect,
  };
};

export const getActionFileDownload = ({ checkpointUrl }: { checkpointUrl?: string }) => {
  return {
    action: 'download' as const,
    ...(checkpointUrl ? { checkpointUrl } : {}),
  };
};
