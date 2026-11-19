// Customer-experience-owned acceptance contract. No network or provider calls.
// Run against a synthetic-only adapter implementing the documented interface.
// Adapter must isolate all fixtures and expose an explicit cleanup operation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function acceptNotifications(adapter) {
  const runId = randomUUID();
  const recipient = `cc-qa-${runId}@example.invalid`;
  const foreignRecipient = `cc-foreign-${runId}@example.invalid`;
  const fixture = await adapter.createFixture({runId, recipient, foreignRecipient});
  try {
    const event = await adapter.enqueue(fixture, {type:'service_request.created'});
    const duplicate = await adapter.enqueue(fixture, {type:'service_request.created'});
    assert.equal(event.id, duplicate.id, 'same source event must deduplicate');
    await adapter.setTransportMode(fixture, 'fail-before-send');
    await adapter.dispatch(fixture);
    assert.equal((await adapter.inspect(fixture,event.id)).delivered, false);
    assert.equal((await adapter.messages(fixture)).length, 0);
    await adapter.setTransportMode(fixture, 'capture-only');
    await Promise.all([adapter.dispatch(fixture),adapter.dispatch(fixture)]);
    await adapter.dispatch(fixture);
    const messages = await adapter.messages(fixture);
    assert.equal(messages.length, 1, 'retry/concurrent dispatch must not duplicate');
    assert.equal(messages[0].recipient, recipient);
    assert.notEqual(messages[0].recipient, foreignRecipient);
    assert.equal((await adapter.inspect(fixture,event.id)).delivered, true);
    const denied = await adapter.enqueue(fixture,{type:'service_request.created',foreign:true});
    await adapter.dispatch(fixture);
    assert.equal((await adapter.inspect(fixture,denied.id)).delivered,false);
    assert.equal((await adapter.messages(fixture)).length,1,'foreign ownership must fail closed');
  } finally {
    await adapter.cleanup(fixture);
    assert.equal(await adapter.remaining(runId),0,'synthetic fixture cleanup');
  }
}
// No default adapter: running this file alone is not acceptance.
// A backend-owned adapter must use capture-only transport, never actual email,
// resolve recipient from authoritative ownership, and reject non-fixture events.
// Real provider delivery and authenticated HTTP acceptance are separate gates.
