import request from 'supertest';
import { app } from '../../app';
import dbClient from '../../dbClient';
import { expectError, getUserIdByAuth0Id } from '../../tests/helpers';

beforeEach(async () => {
  // Create some users
  const user1 = await dbClient.user.create({
    data: {
      auth0Id: 'user1',
    },
  });
  const user2 = await dbClient.user.create({
    data: {
      auth0Id: 'user2',
    },
  });
  const user3 = await dbClient.user.create({
    data: {
      auth0Id: 'user3',
    },
  });
  const user4 = await dbClient.user.create({
    data: {
      auth0Id: 'user4',
    },
  });
  const user5 = await dbClient.user.create({
    data: {
      auth0Id: 'user5',
    },
  });
  const user6 = await dbClient.user.create({
    data: {
      auth0Id: 'user6',
    },
  });

  // Create a team with one owner
  await dbClient.team.create({
    data: {
      name: 'Test Team 1',
      uuid: '00000000-0000-4000-8000-000000000001',
      stripeCustomerId: '1',
      UserTeamRole: {
        create: [
          {
            userId: user1.id,
            role: 'OWNER',
          },
          { userId: user2.id, role: 'EDITOR' },
          { userId: user3.id, role: 'VIEWER' },
        ],
      },
    },
  });
  // Create a team with 2 owners
  await dbClient.team.create({
    data: {
      name: 'Test Team 2',
      uuid: '00000000-0000-4000-8000-000000000002',
      stripeCustomerId: '2',
      UserTeamRole: {
        create: [
          {
            userId: user1.id,
            role: 'OWNER',
          },
          { userId: user2.id, role: 'OWNER' },
          { userId: user3.id, role: 'EDITOR' },
          { userId: user4.id, role: 'EDITOR' },
          { userId: user5.id, role: 'VIEWER' },
          { userId: user6.id, role: 'VIEWER' },
        ],
      },
    },
  });
});

afterEach(async () => {
  await dbClient.$transaction([
    dbClient.userTeamRole.deleteMany(),
    dbClient.user.deleteMany(),
    dbClient.team.deleteMany(),
  ]);
});

describe('DELETE /v0/teams/:uuid/users/:userId', () => {
  describe('invalid request', () => {
    it('responds with a 404 for a valid user that doesn’t exist', async () => {
      await request(app)
        .delete('/v0/teams/00000000-0000-4000-8000-000000000001/users/245')
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ValidToken user1`)
        .expect(404)
        .expect(expectError);
    });
    it('responds with a 400 for an invalid user', async () => {
      await request(app)
        .delete('/v0/teams/00000000-0000-4000-8000-000000000001/users/foo')
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ValidToken user1`)
        .expect(400)
        .expect(expectError);
    });
  });

  describe('deleting yourself', () => {
    it('allows a team viewer to remove themselves from a team', async () => {
      const userId = await getUserIdByAuth0Id('user3');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000001/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user3`)
        .expect(200);
    });
    it('allows owners to remove themselves from a team IF there’s at least one other owner', async () => {
      const userId = await getUserIdByAuth0Id('user1');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000002/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user1`)
        .expect(200);
    });
    it('does not allow owners to remove themselves from a team IF they’re the only owner', async () => {
      const userId = await getUserIdByAuth0Id('user1');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000001/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user1`)
        .expect(403)
        .expect(expectError);
    });
  });

  describe('deleteing others', () => {
    it('doesn’t allow users without sufficient permission to edit other users', async () => {
      const userId = await getUserIdByAuth0Id('user1');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000002/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user3`)
        .expect(403);
    });
    it('rejects requests to delete a user that isn’t part of the team', async () => {
      const userId = await getUserIdByAuth0Id('user4');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000001/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user1`)
        .expect(404)
        .expect(expectError);
    });
    it('rejects requests for an EDITOR to delete an OWNER', async () => {
      const userId = await getUserIdByAuth0Id('user1');
      await request(app)
        .delete(`/v0/teams/00000000-0000-4000-8000-000000000001/users/${userId}`)
        .set('Authorization', `Bearer ValidToken user2`)
        .expect(403)
        .expect(expectError);
    });
  });
});
