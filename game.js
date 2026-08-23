/* VR Bat Brawl — Prototype 0.6
   Genuine WebXR controller tracking + hand-push locomotion prototype.
   No joystick locomotion / no teleport locomotion.
*/
(() => {
  const canvas = document.getElementById("renderCanvas");
  const statusEl = document.getElementById("status");
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  });

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.025, 0.055, 0.095, 1);
  scene.collisionsEnabled = true;

  // ---------- Lighting ----------
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.4, -1, 0.25), scene);
  key.position = new BABYLON.Vector3(3, 7, -4);
  key.intensity = 0.45;

  // ---------- Materials ----------
  function mat(name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.12,0.12,0.12);
    return m;
  }
  const MAT = {
    floor: mat("floorMat", "#25364d"),
    wall: mat("wallMat", "#3d536f"),
    accent: mat("accentMat", "#27c4f4"),
    handL: mat("handLMat", "#65d6ff"),
    handR: mat("handRMat", "#ff7a7a"),
    bat: mat("batMat", "#d9aa72"),
    grip: mat("gripMat", "#32251d"),
    npc: mat("npcMat", "#ff9d3d"),
    npcHit: mat("npcHitMat", "#fff0a6"),
    rag: mat("ragMat", "#d8782e"),
    sign: mat("signMat", "#101926")
  };

  // ---------- Arena ----------
  const collisionSurfaces = [];
  function box(name, pos, size, material=MAT.wall) {
    const b = BABYLON.MeshBuilder.CreateBox(name, {width:size.x, height:size.y, depth:size.z}, scene);
    b.position.copyFrom(pos);
    b.material = material;
    b.checkCollisions = true;
    collisionSurfaces.push(b);
    return b;
  }

  const ground = box("ground",
    new BABYLON.Vector3(0, -0.12, 0),
    new BABYLON.Vector3(12, 0.24, 12),
    MAT.floor
  );

  // Gorilla-movement practice arena: walls, low blocks, ledges and climbable pillars.
  box("backWall", new BABYLON.Vector3(0, 1.5, 5.7), new BABYLON.Vector3(11.5, 3, 0.25));
  box("leftWall", new BABYLON.Vector3(-5.7, 1.5, 0), new BABYLON.Vector3(0.25, 3, 11.5));
  box("rightWall", new BABYLON.Vector3(5.7, 1.5, 0), new BABYLON.Vector3(0.25, 3, 11.5));
  box("frontRailL", new BABYLON.Vector3(-3.7, .65, -5.65), new BABYLON.Vector3(4, 1.3, .3));
  box("frontRailR", new BABYLON.Vector3(3.7, .65, -5.65), new BABYLON.Vector3(4, 1.3, .3));

  box("platform1", new BABYLON.Vector3(-2.5, 0.45, 1.4), new BABYLON.Vector3(2.5, .9, 2.2), MAT.accent);
  box("platform2", new BABYLON.Vector3(2.7, 0.75, 2.1), new BABYLON.Vector3(2.2, 1.5, 2.2), MAT.accent);
  box("climbWall", new BABYLON.Vector3(0, 1.45, 3.8), new BABYLON.Vector3(4.4, 2.9, .35));
  box("pillarA", new BABYLON.Vector3(-4.0, 1.2, -1.2), new BABYLON.Vector3(.65, 2.4, .65));
  box("pillarB", new BABYLON.Vector3(4.0, 1.2, -1.2), new BABYLON.Vector3(.65, 2.4, .65));

  // ---------- Preview camera (phone/desktop only) ----------
  const previewCamera = new BABYLON.UniversalCamera("previewCamera", new BABYLON.Vector3(0, 1.65, -4.4), scene);
  previewCamera.setTarget(new BABYLON.Vector3(0, 1.2, 1.8));
  previewCamera.minZ = 0.05;
  scene.activeCamera = previewCamera;

  // ---------- World-space instruction sign ----------
  const sign = BABYLON.MeshBuilder.CreatePlane("sign", {width:2.8, height:1.35}, scene);
  sign.position = new BABYLON.Vector3(0, 1.85, 4.9);
  sign.rotation.y = Math.PI;
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(sign, 1024, 512);
  const panel = new BABYLON.GUI.StackPanel();
  panel.paddingTop = "30px";
  ui.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "VR BAT BRAWL";
  title.color = "white";
  title.fontSize = 74;
  title.height = "110px";
  title.fontWeight = "800";
  panel.addControl(title);

  const instructions = new BABYLON.GUI.TextBlock();
  instructions.text = "Push off ground & walls with your hands\nNo teleport • No joystick locomotion\nRight hand = physical bat";
  instructions.color = "#bfeeff";
  instructions.fontSize = 40;
  instructions.height = "180px";
  instructions.textWrapping = true;
  panel.addControl(instructions);

  let playerHP = 100;
  const PLAYER_MAX_HP = 100;
  let playerDead = false;
  let playerInvuln = 0;
  let deathTimer = 0;

  const hpText = new BABYLON.GUI.TextBlock();
  hpText.text = "NPC: 100 HP   YOU: 100 HP";
  hpText.color = "#ffd59d";
  hpText.fontSize = 48;
  hpText.height = "90px";
  panel.addControl(hpText);

  const deathPlane = BABYLON.MeshBuilder.CreatePlane("deathPlane", {width:2.8, height:1.3}, scene);
  deathPlane.setEnabled(false);
  const deathUi = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(deathPlane, 1024, 480);

  const deathBg = new BABYLON.GUI.Rectangle();
  deathBg.cornerRadius = 48;
  deathBg.color = "white";
  deathBg.thickness = 8;
  deathBg.background = "#330000EE";
  deathUi.addControl(deathBg);

  const deathText = new BABYLON.GUI.TextBlock();
  deathText.text = "YOU DIED";
  deathText.color = "#ffffff";
  deathText.fontSize = 118;
  deathText.fontWeight = "900";
  deathBg.addControl(deathText);

  const NPC_VOICES = {"Ow!": "data:audio/ogg;base64,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", "That hurt!": "data:audio/ogg;base64,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", "Stop that!": "data:audio/ogg;base64,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", "Come here!": "data:audio/ogg;base64,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", "You can't hide!": "data:audio/ogg;base64,T2dnUwACAAAAAAAAAAALp2OzAAAAAD6OeyIBE09wdXNIZWFkAQE4AcBdAAAAAABPZ2dTAAAAAAAAAAAAAAunY7MBAAAA8WPRBwE9T3B1c1RhZ3MMAAAATGF2ZjYxLjcuMTAzAQAAAB0AAABlbmNvZGVyPUxhdmM2MS4xOS4xMDEgbGlib3B1c09nZ1MAAIC7AAAAAAAAC6djswIAAABi2GnQMjhLR0k/RDYbJEA1M1A2LjI8RjsuMR0lPjsqQD06Sz40OC8xOjY9SDw4QkpZMTEkHRwcaIBw2R1OFKxEZIFHPcFk+bRcs7ki67htDzwR+D8SvnZjwDZFP8wmYT/z6i45k2QTbdHzps8R6hdorKtwY+vMBXNrny77JZ1dhTc7k2E6LUWNcFIBeQRwp9eEbyRhxiA4uZH3/6kALrbxMrhj2JgPssZUK5Q2ZI0k3KOnkInDhaneF6RoqHlqnCuXhfjmfDwJCWzerQ/WBmJEipWKsZ0ZvZYGduuKTWbLVQq1u1OYBdyK7/UXoWYOv2OFAGflg3qusll+uhM+96KmFWiw/0EuMyeT4kaMskgzdEDotzVcxSUdBdnamA4mPwfmSA0QX/BBEHbnGadyt+IW9UN5M4cI5greA6jZucDtOv0GAgR64DrvcfZouFONhx6HwV7ru/oZC4Ed9xLbw0XYez7ZAX0hVZs9Nosm2Uz5Jtc321CcLjfS1VMztTBvvVNNVA6dmuznSjZotaFCBxZj1ZeB8d/yZgkit2NY6HQiUnsP8kzd20IuVv8UF0ySbwTaawp+LW/CqfMtdiK9JJQiaR/Hq5jno6My3Ka9K2iuCWJcjTtjAeTIlgDAgZKkufBdDWDjsFvyltfMpTXKBAWQXPIqgt5Ggz53P5D4H7xBtBMSi2g0NUAAxDhMGV11sGijZOJ0Bafd1UA4A+uLgGiGIGJSoa7J3aECUyTTGLvd6mNgs2GOj74xR/Oour6fI+uLmmiFb2dGfhVKBl2yxWkSkAJY39mXaqx1LmhGSZZ1c6PLpw6x3iqQ+BsBR2uLYmvHIavYiceuimfnSeLprOUZe79olqBWTvDtHyp2KfMGkGYumGY9iYAmsB30Myy0lXKa5N+43MBLTyfEWu6m3aTXcsh7pNl/1miFXeXJSO8RgX86wvlhOGL+SZZuv28WqV5BuetKawFPfqtrwnXtcjhNc9/XgU9tliqQdGi1QfLhkGB7qFx/ZmfCET51WpoGZXDFK571wLwYSvCi3cw1RTPiN3mL2OlDzbmmVphsGWWgb1+HfvaVSyY10wyElIBA2M2qXQyPrkEBqDBJaLlpCVUR8gU2HkFDxR900FrqQbYIfGe5NFgCOrGe2Vy30cbf8dr7EG97IcK1vofERZVLiCA+aLUVldBiTi/sDMx3n9SyySaoV9ZUY+yIcPL38Zc3NCU0ldMATlbhVbdRKPfgZ2i0yaxKqDYtZpK/eZsVFUkuL5yEYnPn8eRr9t93oPSXmEDiCNYVBnN8pLDLmBVW/yGtaK0ZszNcc5/iIaqTsWISfGyNSxjOkaBfPgU/QbsrFRAasnxR1I7p/4M6ZxtiO/JQ0HTiHyQxeLems7ntaK3wmPLcUKALgqqw2f9SrK1Cw0flMVo7iT0dKOhR0wcl8H9ybx8UONR7fUImctAa//Foh0O3KfTWtuhhWMuIkFCIEqZ6DWimYS394vt2lR6fYQbnbpXBZZpZPdFG+cQErP3QQCgYICrSqLE4EXUbr5o5sU6zAt66wWkErj9l4qZVaKXxVz4W6M290nfu5AD++i+MTl5YuIEuH6zjFebbX17VK7SVgT6wb5GV7ZYanmijg+F5RRVghVcWHSrAbOJfY4y5bbZn5EIHLzDnahPD+uISMG+qDhk7hb9OgUCqV7FoKMDBHU0SBwj3UmjnSEvoIeh3YiBmQLSpDDGxoGiGBzt7qEGsd5UJQtjY/jkpVu7vaKGbb/a6Tmrs9jT/k2S0GL1olKSBOdfkydDOHvb4AGw0/vh/swu4uya+55IQmNEDJSgtCra6HhbgePiYDKwrlKixPTeZHBBEH7l/1VAIWmiWjfaAwNeAxyv5noDarrB2iqtF5Z1tZfzZCwBPRfgQCieM+e5Y2jEnckZLxru+Pg3XfegkCebeqo0UaITqg8BBmyRtmRQXB4vyU+n083fO0/BaQEuFPSL/8fzN2Yc2/Xh1ydZmaIPIjjACJYKLRo02RDVXnb0kKav8f3ZN9McRXwQYSdq3/KN1FL6QkdlGCTxvFsVDJ3AuoT/2Zxx2kY8aFrp4X2iUIBXXa5+++LrqK+HVj4qdz0y6/MMWx1tHGbt7BAApkUJEd63PRdVnx4Za21VbAiqbNZ0rVoNkGq35XjRolVgynnBlooFBuae8jg/p6xVDAs/5OIn7uDTl2WSZLnfLMTgfzViLXqVI7/hUTcwE+LnMWyIuHQOiaLh7984aGS/KqwNA3BiefnAK5KwXtS70ulQLq1Bc0kFq9lB94zorIEbiq0yI0x4+1zVnOvSBvw7yWUKn2Umr+RDiB469LKGg/GubaK8zs8cpFmHwgeSlmoEVY+mHsZRVNiTq10YLPfqLTSMchEUcvJgzEzz8omcOsmIuZnyy4ZPguaxi1SRTYoxotEucuxh1LkPht7XJeHPvgpTK/Wok5zzOGRVEZ/7cMB0pS1CQeAe9jaaMBnkCExGUapYBaLcmqF8ef4pt5obNX0HEimBABLqcHu1zZs0x9Rqp96UUOy/gqEca4wYtJYYknwHY+BMdaOWKVq5otdcsD0+TEKrj3q/czJ9Sw6JSEKh0Mtv++y4oEPVoO4SlyqHkX/0ak9SGXv7WbGi0/1RcY/IfmfGjh5yLKLMfBLQRI08JgsGQUDzBK0SnTwf9jo2Z9NsJ934tFjM5KF1otQ8ARIKTrU7WWOpBXXOYskt1BCOFUDd6hHeejj8u3Gdfh1gPCcsVGI6S6Wn1Y5ZO7W6cC78oEWJSaLUPA/ex9a+D5lCLWx+uurz7uiH8P0l8xoPq6tVy6b7eJu5whNiBLD+Ccj18Xuemkj8/voRNaLVY4KIUplO3NB2qjUwpGuCAHz2ySSsGFeaRBERLXuaYfAzFT7nCJ0BbW8EtMaT8isGRzuayIT3q/4ihP2iyqBRVqrg6VUFLG4dS9YhoatNOMou3BGnEiOHSNVPQxGBW9oudzi6m1TwZ89DXMP5mSER1hfcy7B+9BfLqtyd+PGSbpQ2nE2ixe6QLEOnJfFOzliRyqpUQzvgLpU5DRumKV2Qxukqr3sV5i4pOz+C6oppJ0AdJ6naGi0EjKJuQ18Dz02itQwDbwxoZYkLruuZZoAsRWW7JjCzJYha9EUUK0Sl5OHKE2qkhKxhEFBR5xWs3rJPqHQd30aMOaKyUEh1J9zfC/EVd4VCx1f+KvKa7++lxzi/GfFbIyfKwQ+yRVbf4A2yP3AMUU9hEndp0Ti8/+UF/y/BhY1YMdwECaKp+gFcJzDwUkpg8Xwcxzy0Ri5K23Hj0ZW4nu5cQlSmFMiVR4SXHP8xVmiazcOdO0ZoJKh7a5cgkPdAd5PHBCw0tHrltDS/qVSdomg9reEB40XRY9MKZ4yqWUdfLW/WxW6CJ0ENX/i1liIdt252wukM2DWTFbOP30g9D/YfS0a54bhOSek1V7VvbYAZqntZQnwyJRjPFWQ5LZ+o0wpo9xuOCoWiEVVQ5t0uGUei69QhdQbSo5Esa84NtcYa7Atly+HBly8c14+rEpJk8AMuQezlljCdolNAS7bYV402cuBM5tWAHsBbPMcScrPmD8It2zpeOZhqme5yhQWADJ0hSXie93wODaIOiAATgkEkxdDEir5auo3VU7IsaiKFVNTbFm6mhfDzyC18LaC57AR1NFCgpp23IB5JfW0oSLZoKsjSQzwPri4BoCh+gYS4UZvgMo/tH41Ce2X8LPjBWpF9Q4CkIaAfQpMUl0isV6IViwQIo2KVB8HjZQ8tfUOApEU9nZ1MABOT1AAAAAAAAC6djswMAAAAu/XL/EB4iHBMTExMTExMTExMTExNoB8GisR8x00XuZveSUE+Y1/CvwsFO4Yiw31DgKQBoB9CkxSdE5Anoy2hsvdWD0LGB0bB1TLMh4Voo/OYj64uMaAfVGduacllbjIStKO47LXbYUdy8a/rLA+uLnGgHyXnIyVfAohIjdruSQHzgKQxoB8l5yMlXwKISI4DbkkR84CkYaAfJecjJV8CiEiOA25JAfOApCGgHyXnIyVfAohIjivuSRHzgKRRoB8l5yMlXwKISI4r7kmTU4CkEaAfJecjJV8CiEiOVG5JAfOApFGgHyXnIyVfAohIjlRuSRHzgKQBoB8l5yMlXwKISI587kkB84CkQaAfJecjJV8CiEiOfO5JAfOApAGgHyXnIyVfAohIjqVuSRHzgKQxoB8l5yMlXwKISI7N7kkB84CkcaAfJecjJV8CiEiOze5JAfOApDGgHyXnIyVfAohIjvZuSRHzgKRg=", "Got you!": "data:audio/ogg;base64,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", "Back off!": "data:audio/ogg;base64,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"};

  function showDeathScreen() {
    if (!xrCamera) return;
    playerDead = true;
    deathTimer = 2.8;
    bodyVelocity.set(0,0,0);

    deathPlane.parent = xrCamera;
    deathPlane.position.set(0, 0, 1.45);
    deathPlane.rotation.set(0, Math.PI, 0);
    deathPlane.setEnabled(true);
  }

  function respawnPlayer() {
    playerHP = PLAYER_MAX_HP;
    playerDead = false;
    playerInvuln = 1.25;
    deathPlane.setEnabled(false);

    if (xrCamera) {
      xrCamera.position.set(0, 0, -3.2);
    }
    bodyVelocity.set(0,0,0);
    updateHpText();
  }

  // ---------- NPC ----------
  let npc = null;
  const ragdolls = [];
  const NPC_HEIGHT = 1.85;
  const NPC_RADIUS = .30;
  const NPC_WALK_SPEED = 1.05;

  function updateHpText(extra="") {
    const n = npc ? Math.max(0, Math.ceil(npc.hp)) : 0;
    hpText.text = extra || `NPC: ${n} HP   YOU: ${Math.max(0, Math.ceil(playerHP))} HP`;
  }

  function createSpeechBubble(root) {
    const plane = BABYLON.MeshBuilder.CreatePlane("npcSpeech", {width:1.5, height:.42}, scene);
    plane.parent = root;
    plane.position.y = 2.43;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const tex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 768, 220);
    const rect = new BABYLON.GUI.Rectangle();
    rect.cornerRadius = 34;
    rect.color = "white";
    rect.thickness = 5;
    rect.background = "#111827DD";
    tex.addControl(rect);

    const text = new BABYLON.GUI.TextBlock();
    text.text = "";
    text.color = "white";
    text.fontSize = 56;
    text.fontWeight = "700";
    text.textWrapping = true;
    rect.addControl(text);

    plane.setEnabled(false);
    return {plane, text};
  }

  function createNpcHpDisplay(root) {
    const plane = BABYLON.MeshBuilder.CreatePlane("npcHpDisplay", {width:1.05, height:.24}, scene);
    plane.parent = root;
    plane.position.y = 2.08;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    const tex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 700, 170);

    const bg = new BABYLON.GUI.Rectangle();
    bg.cornerRadius = 28;
    bg.color = "white";
    bg.thickness = 4;
    bg.background = "#111827E8";
    tex.addControl(bg);

    const hp = new BABYLON.GUI.TextBlock();
    hp.text = "100 HP";
    hp.color = "white";
    hp.fontSize = 66;
    hp.fontWeight = "800";
    bg.addControl(hp);

    return {plane, text:hp};
  }

  function updateNpcOverheadHp() {
    if (!npc || !npc.hpUi) return;
    npc.hpUi.text.text = `${Math.max(0, Math.ceil(npc.hp))} HP`;
  }

  function createNpc() {
    const root = new BABYLON.TransformNode("npcRoot", scene);
    root.position = new BABYLON.Vector3(0, 0, 1.7);

    const body = BABYLON.MeshBuilder.CreateCapsule("npcBody", {
      height:.92, radius:.29, tessellation:16
    }, scene);
    body.parent = root;
    body.position.y = 1.08;
    body.material = MAT.npc;

    const head = BABYLON.MeshBuilder.CreateSphere("npcHead", {
      diameter:.48, segments:16
    }, scene);
    head.parent = root;
    head.position.y = 1.69;
    head.material = MAT.npc;

    const leftLeg = BABYLON.MeshBuilder.CreateCapsule("npcLeftLeg", {
      height:.72, radius:.095, tessellation:12
    }, scene);
    leftLeg.parent = root;
    leftLeg.position.set(-.14, .40, 0);
    leftLeg.material = MAT.npc;

    const rightLeg = BABYLON.MeshBuilder.CreateCapsule("npcRightLeg", {
      height:.72, radius:.095, tessellation:12
    }, scene);
    rightLeg.parent = root;
    rightLeg.position.set(.14, .40, 0);
    rightLeg.material = MAT.npc;

    const leftArm = BABYLON.MeshBuilder.CreateCapsule("npcLeftArm", {
      height:.68, radius:.085, tessellation:12
    }, scene);
    leftArm.parent = root;
    leftArm.position.set(-.38, 1.10, 0);
    leftArm.material = MAT.npc;

    const rightArm = BABYLON.MeshBuilder.CreateCapsule("npcRightArm", {
      height:.68, radius:.085, tessellation:12
    }, scene);
    rightArm.parent = root;
    rightArm.position.set(.38, 1.10, 0);
    rightArm.material = MAT.npc;

    const speech = createSpeechBubble(root);
    const hpUi = createNpcHpDisplay(root);

    npc = {
      root, body, head, leftLeg, rightLeg, leftArm, rightArm,
      parts:[body, head, leftLeg, rightLeg, leftArm, rightArm],
      speech, hpUi,
      hp:100, maxHp:100,
      alive:true,
      hitCooldown:0,
      attackCooldown:.7,
      attackAnim:0,
      velocity:new BABYLON.Vector3(0,0,0),
      flash:0,
      walkPhase:0,
      speechCooldown:0,
      bubbleTimer:0,
      hasGreeting:false
    };
    updateHpText();
  }

  let lastNpcVoice = null;

  function playNpcVoice(line) {
    const src = NPC_VOICES[line];
    if (!src) return;

    try {
      if (lastNpcVoice) {
        lastNpcVoice.pause();
        lastNpcVoice.currentTime = 0;
      }
      const a = new Audio(src);

      const hurt = line.includes("hurt") || line === "Ow!" || line.includes("Stop");
      const attack = line.includes("Got") || line.includes("Back");
      const chase = line.includes("Come") || line.includes("hide");

      if (hurt) {
        a.volume = 1.0;
        a.playbackRate = 1.08 + Math.random()*.08;
      } else if (attack) {
        a.volume = 1.0;
        a.playbackRate = .93 + Math.random()*.06;
      } else if (chase) {
        a.volume = .96;
        a.playbackRate = .98 + Math.random()*.05;
      } else {
        a.volume = .94;
        a.playbackRate = .98 + Math.random()*.05;
      }

      lastNpcVoice = a;
      a.play().catch(() => {});
    } catch (_) {}
  }

  function npcSpeak(lines, force=false) {
    if (!npc || !npc.alive) return;
    if (!force && npc.speechCooldown > 0) return;

    const line = lines[Math.floor(Math.random()*lines.length)];
    npc.speechCooldown = 2.2 + Math.random()*1.4;
    npc.bubbleTimer = 1.8;
    npc.speech.text.text = line;
    npc.speech.plane.setEnabled(true);
    playNpcVoice(line);
  }

  createNpc();

  // ---------- Hands / controller state ----------
  const hands = {
    left:  { controller:null, node:null, mesh:null, rawLast:null, trackLast:null, visualPos:null, contact:false, anchor:null, contactNormal:null, contactTrack:null, waitUntilClear:false, lastImpact:0 },
    right: { controller:null, node:null, mesh:null, rawLast:null, trackLast:null, visualPos:null, contact:false, anchor:null, contactNormal:null, contactTrack:null, waitUntilClear:false, lastImpact:0 }
  };

  function makeHandMesh(side) {
    // Stylised "human" VR hand with 3 digits total:
    // thumb + two forward fingers. Rounded pieces avoid the old ball-hand look.
    const root = new BABYLON.TransformNode(side+"HandRoot", scene);
    const handMat = side === "left" ? MAT.handL : MAT.handR;

    const palm = BABYLON.MeshBuilder.CreateCapsule(side+"Palm", {
      height:.16, radius:.055, tessellation:12
    }, scene);
    palm.parent = root;
    palm.rotation.x = Math.PI/2;
    palm.position.z = .025;
    palm.scaling.x = 1.12;
    palm.scaling.y = .78;
    palm.material = handMat;

    const wrist = BABYLON.MeshBuilder.CreateCapsule(side+"Wrist", {
      height:.085, radius:.037, tessellation:10
    }, scene);
    wrist.parent = root;
    wrist.rotation.x = Math.PI/2;
    wrist.position.z = -.085;
    wrist.material = handMat;

    const thumb = BABYLON.MeshBuilder.CreateCapsule(side+"Thumb", {
      height:.10, radius:.020, tessellation:10
    }, scene);
    thumb.parent = root;
    // Thumb sides corrected for the player's point of view.
    thumb.rotation.z = side === "left" ? .72 : -.72;
    thumb.rotation.x = .18;
    thumb.position.x = side === "left" ? .066 : -.066;
    thumb.position.z = .005;
    thumb.position.y = -.010;
    thumb.material = handMat;

    const fingerXs = [-.028, .028];
    for (let i=0;i<2;i++) {
      const f = BABYLON.MeshBuilder.CreateCapsule(side+"Finger"+i, {
        height:.135 - i*.008, radius:.018, tessellation:10
      }, scene);
      f.parent = root;
      f.rotation.x = Math.PI/2;
      f.position.x = fingerXs[i];
      f.position.z = .125;
      f.position.y = .004;
      f.material = handMat;
    }

    root.setEnabled(false);
    return root;
  }

  hands.left.mesh = makeHandMesh("left");
  hands.right.mesh = makeHandMesh("right");

  // ---------- Player body / floor support ----------
  // Compact ape-style body: upper chest -> waist/high hips, no legs.
  // We use two visible pieces because one capsule was too easy to lose from view.
  const chest = BABYLON.MeshBuilder.CreateCapsule("playerChest", {
    height:.46, radius:.245, tessellation:14
  }, scene);
  chest.material = MAT.accent;
  chest.visibility = .62;
  chest.isPickable = false;
  chest.setEnabled(false);

  const waist = BABYLON.MeshBuilder.CreateSphere("playerWaist", {
    diameter:.38, segments:14
  }, scene);
  waist.material = MAT.accent;
  waist.visibility = .56;
  waist.isPickable = false;
  waist.scaling.y = .72;
  waist.setEnabled(false);

  function keepRigAboveFloor() {
    if (!xrCamera) return;
    if (xrCamera.position.y < 0) xrCamera.position.y = 0;
    if (xrCamera.position.y <= .002 && bodyVelocity.y < 0) {
      bodyVelocity.y = 0;
      xrCamera.position.y = 0;
    }
  }

  function updatePlayerBody() {
    if (!xrCamera || xr?.baseExperience?.state !== BABYLON.WebXRState.IN_XR) {
      chest.setEnabled(false);
      waist.setEnabled(false);
      return;
    }

    chest.setEnabled(true);
    waist.setEnabled(true);

    const head = xrCamera.globalPosition.clone();
    let forward = xrCamera.getForwardRay(1).direction.clone();
    forward.y = 0;
    if (forward.lengthSquared() < .001) forward.set(0,0,1);
    forward.normalize();

    // Slightly behind the head so it is visible when looking down,
    // but doesn't sit inside the camera.
    const back = forward.scale(-.12);

    chest.position.set(
      head.x + back.x,
      head.y - .43,
      head.z + back.z
    );

    waist.position.set(
      head.x + back.x,
      head.y - .72,
      head.z + back.z
    );

    const yaw = Math.atan2(forward.x, forward.z);
    chest.rotation.y = yaw;
    waist.rotation.y = yaw;
  }

  // ---------- Bat ----------
  const batRoot = new BABYLON.TransformNode("batRoot", scene);
  const batBarrel = BABYLON.MeshBuilder.CreateCylinder("batBarrel", {
    height:.72, diameterTop:.095, diameterBottom:.065, tessellation:16
  }, scene);
  batBarrel.parent = batRoot;
  batBarrel.rotation.x = Math.PI/2;
  batBarrel.position.z = .34;
  batBarrel.material = MAT.bat;

  const batGrip = BABYLON.MeshBuilder.CreateCylinder("batGrip", {
    height:.24, diameter:.055, tessellation:12
  }, scene);
  batGrip.parent = batRoot;
  batGrip.rotation.x = Math.PI/2;
  batGrip.position.z = -.14;
  batGrip.material = MAT.grip;
  batRoot.setEnabled(false);

  let batTipLast = null;
  let batTipVelocity = BABYLON.Vector3.Zero();
  let batHitCooldown = 0;

  function getBatTipWorld() {
    const local = new BABYLON.Vector3(0, 0, .73);
    return BABYLON.Vector3.TransformCoordinates(local, batRoot.getWorldMatrix());
  }

  // ---------- Haptics ----------
  async function pulse(handState, intensity, durationMs) {
    try {
      const gamepad = handState?.controller?.inputSource?.gamepad;
      if (!gamepad) return;

      intensity = Math.max(0, Math.min(1, intensity));
      durationMs = Math.max(10, Math.min(180, durationMs));

      if (gamepad.hapticActuators && gamepad.hapticActuators[0]?.pulse) {
        await gamepad.hapticActuators[0].pulse(intensity, durationMs);
        return;
      }
      if (gamepad.vibrationActuator?.playEffect) {
        await gamepad.vibrationActuator.playEffect("dual-rumble", {
          duration: durationMs,
          strongMagnitude: intensity,
          weakMagnitude: Math.min(1, intensity * .75)
        });
      }
    } catch (_) {}
  }

  // ---------- Simple collision helpers ----------
  const HAND_RADIUS = .09;
  function closestPointAABB(p, mesh) {
    const bi = mesh.getBoundingInfo().boundingBox;
    const min = bi.minimumWorld, max = bi.maximumWorld;
    return new BABYLON.Vector3(
      Math.max(min.x, Math.min(max.x, p.x)),
      Math.max(min.y, Math.min(max.y, p.y)),
      Math.max(min.z, Math.min(max.z, p.z))
    );
  }

  function handContactInfo(pos) {
    let best = null;
    let bestDist = Infinity;

    for (const surf of collisionSurfaces) {
      surf.computeWorldMatrix(true);
      const q = closestPointAABB(pos, surf);
      const dVec = pos.subtract(q);
      const d = dVec.length();
      if (d < HAND_RADIUS && d < bestDist) {
        bestDist = d;
        let normal;
        if (d > .0001) {
          normal = dVec.scale(1/d);
        } else {
          // Inside/very near: estimate normal from nearest face.
          const bb = surf.getBoundingInfo().boundingBox;
          const min = bb.minimumWorld, max = bb.maximumWorld;
          const faces = [
            {v:Math.abs(pos.x-min.x), n:new BABYLON.Vector3(-1,0,0)},
            {v:Math.abs(max.x-pos.x), n:new BABYLON.Vector3(1,0,0)},
            {v:Math.abs(pos.y-min.y), n:new BABYLON.Vector3(0,-1,0)},
            {v:Math.abs(max.y-pos.y), n:new BABYLON.Vector3(0,1,0)},
            {v:Math.abs(pos.z-min.z), n:new BABYLON.Vector3(0,0,-1)},
            {v:Math.abs(max.z-pos.z), n:new BABYLON.Vector3(0,0,1)}
          ].sort((a,b)=>a.v-b.v);
          normal = faces[0].n;
        }
        best = {surface:surf, point:q, normal, penetration:HAND_RADIUS-d};
      }
    }
    return best;
  }

  // ---------- Locomotion ----------
  let xr = null;
  let xrCamera = null;
  let bodyVelocity = new BABYLON.Vector3(0,0,0);
  const GRAVITY = -4.35;
  const PUSH_GAIN = 1.28;
  const MAX_SPEED = 8.4;
  const FLOOR_HEAD_MIN = 1.15; // tracking-origin safeguard, not a crouch lock

  function controllerNode(controller) {
    return controller.grip || controller.pointer;
  }

  function currentHandPos(h) {
    if (!h.node) return null;
    return h.node.getAbsolutePosition().clone();
  }

  function currentHandTrackingPos(h) {
    if (!h.node) return null;
    // Local controller tracking is used for locomotion delta. This avoids
    // re-reading our own artificial rig movement as a new hand movement.
    return h.node.position ? h.node.position.clone() : currentHandPos(h);
  }

  function pushFromHand(h, rawPos, trackingPos, dt) {
    const geometricContact = handContactInfo(rawPos);

    // After letting go, don't instantly re-stick while raw tracking is still
    // mathematically inside the floor/wall.
    if (h.waitUntilClear && !geometricContact) {
      h.waitUntilClear = false;
    }

    if (!h.contact && geometricContact && !h.waitUntilClear) {
      h.contact = true;
      h.contactNormal = geometricContact.normal.clone();
      h.anchor = geometricContact.point.add(
        h.contactNormal.scale(HAND_RADIUS + .008)
      );
      h.contactTrack = trackingPos.clone();
      h.visualPos = h.anchor.clone();

      const speed = h.trackLast
        ? trackingPos.subtract(h.trackLast).length() / Math.max(dt,.008)
        : 0;
      const impact = Math.min(1, speed / 3.5);
      pulse(h, .10 + impact*.68, 16 + impact*48);
    }

    if (h.contact && h.contactNormal && h.contactTrack && h.trackLast) {
      const n = h.contactNormal;

      // Moving the real controller outward from a planted surface always
      // releases the hand, even if world-space tracking still overlaps it.
      const totalFromPlant = trackingPos.subtract(h.contactTrack);
      const outwardTravel = BABYLON.Vector3.Dot(totalFromPlant, n);
      const tooFar = BABYLON.Vector3.Distance(rawPos, h.anchor) > .48;

      if (outwardTravel > .028 || tooFar) {
        h.contact = false;
        h.waitUntilClear = !!geometricContact;
        h.anchor = null;
        h.contactNormal = null;
        h.contactTrack = null;
      } else {
        const handDelta = trackingPos.subtract(h.trackLast);
        const normalDelta = BABYLON.Vector3.Dot(handDelta, n);

        const tangential = handDelta.subtract(n.scale(normalDelta));
        const intoSurface = n.scale(Math.min(normalDelta, 0));
        const effective = tangential.scale(.88).add(intoSurface.scale(1.10));

        let playerDelta = effective.scale(-1);
        const maxFrameMove = .072;
        const len = playerDelta.length();
        if (len > maxFrameMove) playerDelta.scaleInPlace(maxFrameMove / len);

        if (playerDelta.length() > .0013 && xrCamera) {
          xrCamera.position.addInPlace(playerDelta);
          keepRigAboveFloor();

          const impulse = playerDelta.scale(1 / Math.max(dt,.008));
          bodyVelocity = BABYLON.Vector3.Lerp(bodyVelocity, impulse, .18);
          if (bodyVelocity.length() > MAX_SPEED) {
            bodyVelocity = bodyVelocity.normalize().scale(MAX_SPEED);
          }
        }

        // Planted virtual hand remains on the outside of the surface.
        h.visualPos = h.anchor.clone();
      }
    }

    // Never visually render a free hand under the floor or inside a wall.
    if (!h.contact) {
      const visualContact = handContactInfo(rawPos);
      if (visualContact) {
        h.visualPos = visualContact.point.add(
          visualContact.normal.scale(HAND_RADIUS + .008)
        );
      } else {
        h.visualPos = rawPos.clone();
      }
    }

    h.rawLast = rawPos.clone();
    h.trackLast = trackingPos.clone();
  }

  // ---------- Combat / NPC ----------
  function sphereHitsNpc(center, radius) {
    if (!npc || !npc.alive) return false;
    const centers = [
      {p:npc.root.position.add(new BABYLON.Vector3(0,1.10,0)), r:.43},
      {p:npc.root.position.add(new BABYLON.Vector3(0,1.69,0)), r:.28},
      {p:npc.root.position.add(new BABYLON.Vector3(-.14,.40,0)), r:.18},
      {p:npc.root.position.add(new BABYLON.Vector3(.14,.40,0)), r:.18}
    ];
    return centers.some(x => BABYLON.Vector3.Distance(center, x.p) < radius + x.r);
  }

  function impactBurst(pos, strong=false) {
    const count = strong ? 18 : 8;
    for (let i=0;i<count;i++) {
      const s = BABYLON.MeshBuilder.CreateSphere("spark", {diameter: strong?.045:.03, segments:6}, scene);
      s.position.copyFrom(pos);
      s.material = strong ? MAT.npcHit : MAT.accent;
      const v = new BABYLON.Vector3(
        (Math.random()-.5)*2.5,
        Math.random()*2.0+.5,
        (Math.random()-.5)*2.5
      );
      const born = performance.now();
      const obs = scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime()/1000;
        v.y -= 5*dt;
        s.position.addInPlace(v.scale(dt));
        s.scaling.scaleInPlace(.965);
        if (performance.now()-born > (strong?650:350)) {
          scene.onBeforeRenderObservable.remove(obs);
          s.dispose();
        }
      });
    }
  }

  let audioCtx = null;
  function hitSound(strong=false) {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = strong ? "sawtooth" : "triangle";
      o.frequency.value = strong ? 85 : 130;
      g.gain.setValueAtTime(strong?.12:.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + (strong?.22:.10));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (strong?.22:.10));
    } catch (_) {}
  }

  function resolveNpcAgainstWorld(previousY) {
    if (!npc || !npc.alive) return;

    // Hard global floor.
    if (npc.root.position.y < 0) {
      npc.root.position.y = 0;
      if (npc.velocity.y < 0) npc.velocity.y = 0;
    }

    for (const surf of collisionSurfaces) {
      if (surf === ground) continue;
      surf.computeWorldMatrix(true);
      const bb = surf.getBoundingInfo().boundingBox;
      const min = bb.minimumWorld, max = bb.maximumWorld;

      const px = npc.root.position.x;
      const pz = npc.root.position.z;
      const prevBottom = previousY;
      const prevTop = previousY + NPC_HEIGHT;
      const bottom = npc.root.position.y;
      const top = bottom + NPC_HEIGHT;

      const horizontalOverlap =
        px > min.x - NPC_RADIUS && px < max.x + NPC_RADIUS &&
        pz > min.z - NPC_RADIUS && pz < max.z + NPC_RADIUS;

      if (!horizontalOverlap) continue;

      // Land on top of blocks/platforms.
      if (npc.velocity.y <= 0 &&
          prevBottom >= max.y - .08 &&
          bottom < max.y &&
          top > max.y) {
        npc.root.position.y = max.y;
        npc.velocity.y = 0;
        continue;
      }

      // Hit the underside of a platform.
      if (npc.velocity.y > 0 &&
          prevTop <= min.y + .08 &&
          top > min.y &&
          bottom < min.y) {
        npc.root.position.y = min.y - NPC_HEIGHT;
        npc.velocity.y = 0;
        continue;
      }

      const verticalOverlap = top > min.y && bottom < max.y;
      if (!verticalOverlap) continue;

      // Side collision: push the NPC to the nearest expanded box edge.
      const left = Math.abs(px - (min.x - NPC_RADIUS));
      const right = Math.abs((max.x + NPC_RADIUS) - px);
      const front = Math.abs(pz - (min.z - NPC_RADIUS));
      const back = Math.abs((max.z + NPC_RADIUS) - pz);

      const smallest = Math.min(left, right, front, back);
      if (smallest === left) {
        npc.root.position.x = min.x - NPC_RADIUS;
        if (npc.velocity.x > 0) npc.velocity.x = 0;
      } else if (smallest === right) {
        npc.root.position.x = max.x + NPC_RADIUS;
        if (npc.velocity.x < 0) npc.velocity.x = 0;
      } else if (smallest === front) {
        npc.root.position.z = min.z - NPC_RADIUS;
        if (npc.velocity.z > 0) npc.velocity.z = 0;
      } else {
        npc.root.position.z = max.z + NPC_RADIUS;
        if (npc.velocity.z < 0) npc.velocity.z = 0;
      }
    }
  }

  function moveNpcWithWorld(delta) {
    if (!npc || !npc.alive) return;
    const distance = delta.length();
    const steps = Math.max(1, Math.ceil(distance / .09));
    const step = delta.scale(1 / steps);

    for (let i=0;i<steps;i++) {
      const prevY = npc.root.position.y;
      npc.root.position.addInPlace(step);
      resolveNpcAgainstWorld(prevY);
    }
  }

  function resolveRagdollPart(r) {
    const radius = r.collisionRadius || .16;

    for (const surf of collisionSurfaces) {
      surf.computeWorldMatrix(true);
      const bb = surf.getBoundingInfo().boundingBox;
      const min = bb.minimumWorld;
      const max = bb.maximumWorld;
      const p = r.mesh.position;

      const q = new BABYLON.Vector3(
        Math.max(min.x, Math.min(max.x, p.x)),
        Math.max(min.y, Math.min(max.y, p.y)),
        Math.max(min.z, Math.min(max.z, p.z))
      );

      let dVec = p.subtract(q);
      let d = dVec.length();

      if (d >= radius) continue;

      let normal;
      if (d > .0001) {
        normal = dVec.scale(1/d);
      } else {
        const faces = [
          {v:Math.abs(p.x-min.x), n:new BABYLON.Vector3(-1,0,0)},
          {v:Math.abs(max.x-p.x), n:new BABYLON.Vector3(1,0,0)},
          {v:Math.abs(p.y-min.y), n:new BABYLON.Vector3(0,-1,0)},
          {v:Math.abs(max.y-p.y), n:new BABYLON.Vector3(0,1,0)},
          {v:Math.abs(p.z-min.z), n:new BABYLON.Vector3(0,0,-1)},
          {v:Math.abs(max.z-p.z), n:new BABYLON.Vector3(0,0,1)}
        ].sort((a,b)=>a.v-b.v);
        normal = faces[0].n;
        d = 0;
      }

      r.mesh.position.addInPlace(normal.scale(radius - d + .003));

      const vn = BABYLON.Vector3.Dot(r.vel, normal);
      if (vn < 0) {
        r.vel.subtractInPlace(normal.scale(vn * 1.24));
        r.vel.scaleInPlace(.82);
      }
    }
  }

  function moveRagdollPart(r, dt) {
    const delta = r.vel.scale(dt);
    const steps = Math.max(1, Math.ceil(delta.length() / .055));
    const step = delta.scale(1/steps);

    for (let i=0;i<steps;i++) {
      r.mesh.position.addInPlace(step);
      resolveRagdollPart(r);
    }
  }

  function spawnRagdoll(origin, launchDir, strength) {
    const pieces = [];

    // A more humanoid stylised ragdoll:
    // torso, pelvis, head, upper/lower arms, upper/lower legs.
    const specs = [
      {shape:"capsule", size:[.34,.74], off:[0,1.08,0], rot:[0,0,0], mass:1.5},
      {shape:"sphere",  size:[.46],     off:[0,1.70,0], rot:[0,0,0], mass:.7},
      {shape:"box",     size:[.42,.24,.30], off:[0,.67,0], rot:[0,0,0], mass:1.0},

      {shape:"capsule", size:[.13,.42], off:[-.35,1.25,0], rot:[0,0,.18], mass:.45},
      {shape:"capsule", size:[.11,.38], off:[-.48,.98,0], rot:[0,0,.25], mass:.35},
      {shape:"capsule", size:[.13,.42], off:[ .35,1.25,0], rot:[0,0,-.18], mass:.45},
      {shape:"capsule", size:[.11,.38], off:[ .48,.98,0], rot:[0,0,-.25], mass:.35},

      {shape:"capsule", size:[.15,.50], off:[-.16,.40,0], rot:[0,0,.04], mass:.60},
      {shape:"capsule", size:[.13,.46], off:[-.16,.06,0], rot:[0,0,.03], mass:.50},
      {shape:"capsule", size:[.15,.50], off:[ .16,.40,0], rot:[0,0,-.04], mass:.60},
      {shape:"capsule", size:[.13,.46], off:[ .16,.06,0], rot:[0,0,-.03], mass:.50}
    ];

    for (const sp of specs) {
      let m;
      let collisionRadius;

      if (sp.shape === "sphere") {
        m = BABYLON.MeshBuilder.CreateSphere("ragPart", {
          diameter:sp.size[0], segments:12
        }, scene);
        collisionRadius = sp.size[0] * .5;
      } else if (sp.shape === "box") {
        m = BABYLON.MeshBuilder.CreateBox("ragPart", {
          width:sp.size[0], height:sp.size[1], depth:sp.size[2]
        }, scene);
        collisionRadius = Math.max(...sp.size) * .42;
      } else {
        m = BABYLON.MeshBuilder.CreateCapsule("ragPart", {
          radius:sp.size[0],
          height:sp.size[1],
          tessellation:12
        }, scene);
        collisionRadius = Math.max(sp.size[0]*1.25, sp.size[1]*.30);
      }

      m.material = MAT.rag;
      m.position = origin.add(new BABYLON.Vector3(...sp.off));
      m.rotation.set(...sp.rot);

      // Keep parts moving as one body initially, with only a small amount
      // of local scatter. This looks more like a ragdoll than an explosion.
      const scatter = new BABYLON.Vector3(
        (Math.random()-.5)*.8,
        Math.random()*.7,
        (Math.random()-.5)*.8
      );

      const vel = launchDir.scale(strength).add(scatter).add(
        new BABYLON.Vector3(0, 1.5 + Math.random()*.7, 0)
      );

      pieces.push({
        mesh:m,
        vel,
        collisionRadius,
        spin:new BABYLON.Vector3(
          (Math.random()-.5)*5,
          (Math.random()-.5)*5,
          (Math.random()-.5)*5
        ),
        life:3.6
      });
    }

    ragdolls.push(...pieces);
  }

  function finishNpc(hitPos, swingDir, swingSpeed) {
    npc.alive = false;
    npc.parts.forEach(p => p.setEnabled(false));
    npc.speech.plane.setEnabled(false);
    npc.hpUi.plane.setEnabled(false);

    const dir = swingDir.lengthSquared() > .001 ? swingDir.normalize() :
                npc.root.position.subtract(hitPos).normalize();
    const launch = Math.min(13.0, 5.8 + swingSpeed*.72);

    impactBurst(hitPos, true);
    hitSound(true);
    pulse(hands.right, 1.0, 120);
    spawnRagdoll(npc.root.position.clone(), dir, launch);

    updateHpText("FINISHING HIT!");
    setTimeout(() => {
      npc.root.dispose();
      createNpc();
      if (npc) npc.root.position = new BABYLON.Vector3((Math.random()-.5)*2.5,0,1.6+Math.random()*1.4);
    }, 1800);
  }

  function damageNpc(hitPos, swingDir, speed) {
    if (!npc.alive || npc.hitCooldown>0) return;

    const damage = Math.round(Math.max(7, Math.min(32, 5 + speed*3.8)));
    npc.hp -= damage;
    npc.hitCooldown = .22;
    npc.flash = .12;
    npcSpeak(["Ow!", "That hurt!", "Stop that!"], true);
    updateNpcOverheadHp();

    if (npc.hp <= 0) {
      finishNpc(hitPos, swingDir, speed);
      return;
    }

    const dir = swingDir.lengthSquared()>.001 ? swingDir.normalize() :
                npc.root.position.subtract(hitPos).normalize();
    const knockStrength = Math.min(7.4, 1.2 + speed*.46);
    npc.velocity.addInPlace(dir.scale(knockStrength));

    impactBurst(hitPos, false);
    hitSound(false);
    const hapticStrength = Math.min(.88, .22 + speed*.07);
    pulse(hands.right, hapticStrength, 30 + Math.min(55, speed*4));
    updateHpText(`NPC: ${Math.max(0,npc.hp)} HP (-${damage})   YOU: ${playerHP} HP`);
  }

  // ---------- XR setup ----------
  async function setupXR() {
    if (!navigator.xr) {
      statusEl.textContent = "WebXR is not available in this browser. Manage files on iPhone; play this page in a WebXR VR headset.";
      return;
    }

    try {
      xr = await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground],
        disableTeleportation: true,
        disablePointerSelection: true,
        uiOptions: { sessionMode: "immersive-vr", referenceSpaceType: "local-floor" }
      });

      xrCamera = xr.baseExperience.camera;
      xrCamera.minZ = .04;
      xrCamera.position = new BABYLON.Vector3(0, 0, -3.2);

      // Explicitly remove teleport/pointer features if a Babylon version enabled them anyway.
      try { xr.teleportation?.dispose?.(); } catch (_) {}
      try { xr.pointerSelection?.dispose?.(); } catch (_) {}

      xr.input.onControllerAddedObservable.add((controller) => {
        const side = controller.inputSource.handedness;
        if (side !== "left" && side !== "right") return;

        const h = hands[side];
        h.controller = controller;
        h.node = controllerNode(controller);
        h.mesh.setEnabled(true);

        controller.onMotionControllerInitObservable.add(() => {
          h.node = controllerNode(controller);
          if (side === "right" && h.node) {
            batRoot.parent = h.node;
            batRoot.position.set(0,0,0);
            batRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
            batRoot.setEnabled(true);
          }
        });

        if (side === "right" && h.node) {
          batRoot.parent = h.node;
          batRoot.setEnabled(true);
        }
      });

      xr.input.onControllerRemovedObservable.add((controller) => {
        const side = controller.inputSource.handedness;
        if (!hands[side]) return;
        hands[side].controller = null;
        hands[side].node = null;
        hands[side].rawLast = null;
        hands[side].trackLast = null;
        hands[side].anchor = null;
        hands[side].contactNormal = null;
        hands[side].contactTrack = null;
        hands[side].waitUntilClear = false;
        hands[side].visualPos = null;
        hands[side].contact = false;
        hands[side].mesh.setEnabled(false);
        if (side === "right") batRoot.setEnabled(false);
      });

      xr.baseExperience.onStateChangedObservable.add((state) => {
        if (state === BABYLON.WebXRState.IN_XR) {
          statusEl.textContent = "VR active: plant a hand on a surface and pull/push to move. Swing the right-hand bat at the NPC.";
          document.getElementById("info").style.opacity = ".22";
          bodyVelocity.set(0,0,0);
          xrCamera.position.y = Math.max(0, xrCamera.position.y);
          hands.left.rawLast = hands.right.rawLast = null;
          hands.left.trackLast = hands.right.trackLast = null;
          hands.left.anchor = hands.right.anchor = null;
          hands.left.contactNormal = hands.right.contactNormal = null;
          hands.left.contactTrack = hands.right.contactTrack = null;
          hands.left.waitUntilClear = hands.right.waitUntilClear = false;
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          document.getElementById("info").style.opacity = "1";
        }
      });

      statusEl.textContent = "WebXR detected. Put on the headset and press ENTER VR.";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "XR setup failed: " + (err?.message || err);
    }
  }

  setupXR();

  // ---------- Main update ----------
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(.033, engine.getDeltaTime()/1000);
    batHitCooldown = Math.max(0, batHitCooldown-dt);
    playerInvuln = Math.max(0, playerInvuln-dt);

    if (playerDead) {
      deathTimer -= dt;
      if (deathTimer <= 0) respawnPlayer();
    }

    if (npc) {
      npc.hitCooldown = Math.max(0, npc.hitCooldown-dt);
      npc.attackCooldown = Math.max(0, npc.attackCooldown-dt);
      npc.attackAnim = Math.max(0, npc.attackAnim-dt);
      npc.flash = Math.max(0, npc.flash-dt);
      npc.speechCooldown = Math.max(0, npc.speechCooldown-dt);
      npc.bubbleTimer = Math.max(0, npc.bubbleTimer-dt);

      if (npc.bubbleTimer <= 0 && npc.speech) {
        npc.speech.plane.setEnabled(false);
      }

      if (npc.alive) {
        const npcMat = npc.flash>0 ? MAT.npcHit : MAT.npc;
        npc.parts.forEach(p => p.material = npcMat);

        // Knockback/gravity uses the same world collision as walking.
        npc.velocity.y += -9.4 * dt;
        const physicsDelta = npc.velocity.scale(dt);
        moveNpcWithWorld(physicsDelta);

        const horizontalDrag = Math.pow(.12, dt);
        npc.velocity.x *= horizontalDrag;
        npc.velocity.z *= horizontalDrag;

        // Chase the player automatically.
        let walking = false;
        if (xrCamera) {
          const toPlayer = xrCamera.globalPosition.subtract(npc.root.position);
          toPlayer.y = 0;
          const d = toPlayer.length();

          if (d > .95 && d < 10) {
            walking = true;
            const dir = toPlayer.normalize();

            if (!npc.hasGreeting && d < 5.0) {
              npc.hasGreeting = true;
              npcSpeak(["Come here!", "You can't hide!"], true);
            }

            // Face movement direction.
            npc.root.rotation.y = Math.atan2(dir.x, dir.z);

            // Direct chase with collision sliding against arena geometry.
            moveNpcWithWorld(dir.scale(NPC_WALK_SPEED * dt));

            if (npc.speechCooldown <= 0 && Math.random() < .018) {
              npcSpeak(["Come here!", "I'm coming!", "You can't hide!", "Hey, wait!"]);
            }
          }

          // Close-range NPC attack. No forced camera shove: safer for VR comfort.
          if (d <= 1.08 && npc.attackCooldown <= 0 && !playerDead && playerInvuln <= 0) {
            npc.attackCooldown = .92;
            npc.attackAnim = .34;

            const hitDamage = 14;
            playerHP = Math.max(0, playerHP - hitDamage);

            // Physical player knockback away from NPC + a slight lift.
            const away = xrCamera.globalPosition.subtract(npc.root.position);
            away.y = 0;
            if (away.lengthSquared() < .001) away.set(0,0,-1);
            away.normalize();

            bodyVelocity.addInPlace(
              away.scale(3.4).add(new BABYLON.Vector3(0, 1.15, 0))
            );

            pulse(hands.left, .78, 95);
            pulse(hands.right, .78, 95);
            npcSpeak(["Got you!", "Back off!"], true);
            updateHpText(`NPC: ${Math.max(0,npc.hp)} HP   YOU: ${playerHP} HP (-${hitDamage})`);

            if (playerHP <= 0) {
              updateHpText("YOU DIED");
              showDeathScreen();
            }
          }
        }

        // Very simple walking / attack animation.
        if (walking) npc.walkPhase += dt * 8.0;
        const stride = walking ? Math.sin(npc.walkPhase) * .48 : 0;
        npc.leftLeg.rotation.x = stride;
        npc.rightLeg.rotation.x = -stride;

        if (npc.attackAnim > 0) {
          const punch = Math.sin((.30 - npc.attackAnim) / .30 * Math.PI);
          npc.leftArm.rotation.x = -1.15 * punch;
          npc.rightArm.rotation.x = -1.15 * punch;
        } else {
          npc.leftArm.rotation.x = -stride * .7;
          npc.rightArm.rotation.x = stride * .7;
        }
      }
    }

    // Update tracked hand meshes and locomotion.
    if (xrCamera && xr?.baseExperience?.state === BABYLON.WebXRState.IN_XR && !playerDead) {
      for (const side of ["left","right"]) {
        const h = hands[side];
        if (!h.node) continue;
        const p = currentHandPos(h);
        const trackingP = currentHandTrackingPos(h);
        if (!p || !trackingP) continue;

        pushFromHand(h, p, trackingP, dt);

        const shown = h.visualPos || p;
        h.mesh.position.copyFrom(shown);
        h.mesh.rotationQuaternion =
          h.node.absoluteRotationQuaternion?.clone() || BABYLON.Quaternion.Identity();
      }

      // Air momentum and gravity when not planted.
      const planted = hands.left.contact || hands.right.contact;
      if (!planted) {
        bodyVelocity.y += GRAVITY * dt;
        bodyVelocity.scaleInPlace(Math.pow(.72, dt)); // light drag
        if (bodyVelocity.length() > MAX_SPEED) bodyVelocity = bodyVelocity.normalize().scale(MAX_SPEED);
        xrCamera.position.addInPlace(bodyVelocity.scale(dt));
      } else {
        // Prevent gravity from fighting a planted hand too aggressively.
        bodyVelocity.y = Math.max(bodyVelocity.y, -1.2);
      }

      // Safety bounds + solid floor support for the small player body.
      keepRigAboveFloor();
      xrCamera.position.x = Math.max(-5.15, Math.min(5.15, xrCamera.position.x));
      xrCamera.position.z = Math.max(-5.05, Math.min(5.15, xrCamera.position.z));
      xrCamera.position.y = Math.min(4.2, xrCamera.position.y);
      updatePlayerBody();

      // Bat swing velocity / hit detection.
      if (batRoot.isEnabled()) {
        const tip = getBatTipWorld();
        if (batTipLast) {
          batTipVelocity = tip.subtract(batTipLast).scale(1/Math.max(dt,.008));
          const speed = batTipVelocity.length();

          if (speed > 1.25 && batHitCooldown<=0 && sphereHitsNpc(tip,.15)) {
            batHitCooldown = .20;
            damageNpc(tip, batTipVelocity, speed);
          }

          // Bat against world surfaces => impact haptic.
          const surfHit = handContactInfo(tip);
          if (surfHit && speed > 1.5 && batHitCooldown<=0) {
            batHitCooldown=.12;
            pulse(hands.right, Math.min(.8,.18+speed*.055), 22+Math.min(45,speed*3));
            // No world-hit particle burst here: on Quest this could appear as
            // a distracting flash near the top of the view when hitting the floor.
            hitSound(false);
          }
        }
        batTipLast = tip.clone();
      }
    }

    if (playerDead) {
      chest.setEnabled(false);
      waist.setEnabled(false);
    }

    // Manual ragdoll pieces.
    for (let i=ragdolls.length-1;i>=0;i--) {
      const r = ragdolls[i];
      r.life -= dt;
      r.vel.y -= 7.8*dt;
      moveRagdollPart(r, dt);

      r.mesh.rotation.x += r.spin.x*dt;
      r.mesh.rotation.y += r.spin.y*dt;
      r.mesh.rotation.z += r.spin.z*dt;

      r.vel.x *= Math.pow(.62, dt);
      r.vel.z *= Math.pow(.62, dt);
      if (r.life<=0) {
        r.mesh.dispose();
        ragdolls.splice(i,1);
      }
    }
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
})();
