# VR Bat Brawl — prototype 0.1

This is a real WebXR VR prototype intended to run in a VR headset browser over HTTPS.

## Included now
- 6DoF VR headset tracking
- Left and right tracked controllers/hands
- No teleport locomotion
- No joystick as the main locomotion
- Gorilla-style hand-push locomotion prototype
- Hand collision against floor, walls and obstacles
- Push off the floor and walls
- Momentum + gravity for hand-powered jumps
- Impact-sensitive controller haptics
- Simple climb/movement practice arena
- Physical right-hand bat
- Bat swing speed affects damage
- One reactive NPC with 100 HP
- Knockback
- Special finishing hit
- Multi-piece physics-like ragdoll on final hit
- Strong final-hit haptics + impact effect/sound

## Important prototype limits
This is intentionally version 0.1, not the full game yet.

1. The hand locomotion is a custom WebXR prototype and needs tuning on the actual headset.
2. The final-hit ragdoll is lightweight custom physics, not a full skeletal ragdoll yet.
3. The player-body collision is still simplified. Hands collide with the practice arena; later versions should add a robust body capsule/sweep solver.
4. Multiplayer, voice, accounts, inventory, currencies, shop, trading, progression, maps and AI Director are not included yet.
5. Haptics depend on what the headset browser/controller exposes through WebXR.

## Phone-first workflow
Recommended:
- Manage/edit the project from iPhone in GitHub Codespaces (browser VS Code).
- Run a small static server in Codespaces.
- Make the forwarded port public/HTTPS.
- Open that HTTPS URL in the VR headset browser.
- Press ENTER VR.

Example terminal command:
    python3 -m http.server 3000

Then use the Codespaces Ports tab to expose port 3000.

## Files
- index.html — page, canvas and Babylon.js loader
- game.js — VR tracking, locomotion, haptics, bat combat, NPC, knockback and ragdoll
