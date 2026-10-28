import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composePublicTaraSandboxV5C} from '../src/v5c/tara-public-sandbox-app-v5c.mjs';
test('assemblage refusé par défaut',()=>{
 assert.throws(()=>composePublicTaraSandboxV5C(),/COMPOSITION_DISABLED/);
 assert.throws(()=>composePublicTaraSandboxV5C({enabled:true,environment:'production'}),/COMPOSITION_DISABLED/);
});
test('émission opt-in refuse un dépôt canal absent',()=>{
 assert.throws(()=>composePublicTaraSandboxV5C({enabled:true,environment:'sandbox',
   issueLinks:true}),/CHANNEL_STORE_REQUIRED/);
});
test('route composée mais serveur reste arrêté sans listen explicite',async()=>{
 const orders={create:async()=>{throw Error('not needed');}};
 const taraReservations={reserveCheckout:async()=>{throw Error('not needed');}};
 const app=composePublicTaraSandboxV5C({orders,taraReservations,
   verifyHuman:async()=>false,enforceRateLimit:async()=>false,
   allowedOrigins:['https://pdc.example'],enabled:true,environment:'sandbox'});
 assert.equal(app.server.listening,false);assert.equal(app.issueLinks,false);
 app.server.close();
});
