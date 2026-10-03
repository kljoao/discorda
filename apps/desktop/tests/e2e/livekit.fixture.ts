// Test-only adapter: Room uses instance arrow methods, so bind the fixture overrides after construction.
// @ts-expect-error Direct browser bundle intentionally bypasses the test alias.
import * as sdk from '../../../../node_modules/livekit-client/dist/livekit-client.esm.mjs';
// @ts-expect-error The application's types continue to come from the real package.
export * from '../../../../node_modules/livekit-client/dist/livekit-client.esm.mjs';
import type {Room as RoomType} from 'livekit-client';
const Base=sdk.Room as typeof RoomType;
export class Room extends Base {
 constructor(...args:ConstructorParameters<typeof RoomType>){super(...args);this.connect=Room.prototype.connect.bind(this);this.disconnect=Room.prototype.disconnect.bind(this);this.startAudio=Room.prototype.startAudio.bind(this);}
}
