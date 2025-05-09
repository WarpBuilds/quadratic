import { Configuration, IdentityApi } from '@ory/kratos-client';
import * as Sentry from '@sentry/node';
import type { Algorithm } from 'jsonwebtoken';
import type { GetVerificationKey } from 'jwks-rsa';
import jwksRsa from 'jwks-rsa';
import { ORY_ADMIN_HOST, ORY_JWKS_URI } from '../env-vars';
import type { ByEmailUser, User } from './auth';

const config = new Configuration({
  basePath: ORY_ADMIN_HOST,
  baseOptions: {
    withCredentials: true,
  },
});
const sdk = new IdentityApi(config);

export const jwtConfigOry = {
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: ORY_JWKS_URI,
  }) as GetVerificationKey,
  algorithms: ['RS256'] as Algorithm[],
};

export const getUsersFromOry = async (users: { id: number; auth0Id: string }[]): Promise<Record<number, User>> => {
  // If we got nothing, we return an empty object
  if (users.length === 0) return {};

  const ids = users.map(({ auth0Id }) => auth0Id);
  let identities;

  try {
    identities = (await sdk.listIdentities({ ids })).data;
  } catch (e) {
    console.error(e);
    return {};
  }

  // Map users by their Quadratic ID. If we didn't find a user, throw.
  const usersById: Record<number, User> = users.reduce((acc: Record<number, User>, { id, auth0Id }) => {
    const oryUser = identities.find(({ id }) => id === auth0Id);

    // If we're missing data we expect, log it to Sentry and skip this user
    if (!oryUser || oryUser.traits.email === undefined) {
      Sentry.captureException({
        message: 'Ory user returned without `email`',
        level: 'error',
        extra: {
          auth0IdInOurDb: auth0Id,
          oryUserResult: oryUser,
        },
      });
      throw new Error('Failed to retrieve all user info from Ory');
    }

    const { email, name } = oryUser.traits;

    return {
      ...acc,
      [id]: {
        id,
        auth0Id,
        email,
        name: `${name.first} ${name.last}`,
        picture: undefined,
      },
    };
  }, {});

  return usersById;
};

export const getUsersFromOryByEmail = async (email: string): Promise<ByEmailUser[]> => {
  let identities;

  try {
    identities = (await sdk.listIdentities({ credentialsIdentifier: email })).data;
  } catch (e) {
    console.error(e);
    return [];
  }

  return identities.map(({ id }) => ({ user_id: id }));
};
