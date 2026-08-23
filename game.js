(() => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true, { stencil:true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(.025,.055,.095,1);
  scene.collisionsEnabled = true;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = .9;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-.4,-1,.25), scene);
  sun.position = new BABYLON.Vector3(3,7,-4);
  sun.intensity = .45;

  function mkMat(name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(.10,.10,.10);
    return m;
  }

  const MAT = {
    floor: mkMat("floor","#26384e"),
    wall: mkMat("wall","#405875"),
    accent: mkMat("accent","#22c7f4"),
    handL: mkMat("handL","#66d9ff"),
    handR: mkMat("handR","#ff7b7b"),
    bat: mkMat("bat","#d9a66e"),
    grip: mkMat("grip","#2f2119"),
    npc: mkMat("npc","#f59a3d"),
    npcAngry: mkMat("npcAngry","#ef6a35"),
    npcScared: mkMat("npcScared","#f7b267"),
    npcHit: mkMat("npcHit","#fff0a6"),
    hudGreen: mkMat("hudGreen","#22c55e")
  };

  // ------------------------------------------------------------
  // Arena
  // ------------------------------------------------------------
  const collisionSurfaces = [];
  function box(name, pos, size, material=MAT.wall) {
    const b = BABYLON.MeshBuilder.CreateBox(name,{
      width:size.x,height:size.y,depth:size.z
    },scene);
    b.position.copyFrom(pos);
    b.material = material;
    b.checkCollisions = true;
    collisionSurfaces.push(b);
    return b;
  }

  const ground = box("ground",new BABYLON.Vector3(0,-.12,0),new BABYLON.Vector3(12,.24,12),MAT.floor);
  box("backWall",new BABYLON.Vector3(0,1.5,5.7),new BABYLON.Vector3(11.5,3,.25));
  box("leftWall",new BABYLON.Vector3(-5.7,1.5,0),new BABYLON.Vector3(.25,3,11.5));
  box("rightWall",new BABYLON.Vector3(5.7,1.5,0),new BABYLON.Vector3(.25,3,11.5));
  box("frontRailL",new BABYLON.Vector3(-3.7,.65,-5.65),new BABYLON.Vector3(4,1.3,.3));
  box("frontRailR",new BABYLON.Vector3(3.7,.65,-5.65),new BABYLON.Vector3(4,1.3,.3));
  box("platform1",new BABYLON.Vector3(-2.5,.45,1.4),new BABYLON.Vector3(2.5,.9,2.2),MAT.accent);
  box("platform2",new BABYLON.Vector3(2.7,.75,2.1),new BABYLON.Vector3(2.2,1.5,2.2),MAT.accent);
  box("climbWall",new BABYLON.Vector3(0,1.45,3.8),new BABYLON.Vector3(4.4,2.9,.35));
  box("pillarA",new BABYLON.Vector3(-4,1.2,-1.2),new BABYLON.Vector3(.65,2.4,.65));
  box("pillarB",new BABYLON.Vector3(4,1.2,-1.2),new BABYLON.Vector3(.65,2.4,.65));

  const previewCamera = new BABYLON.UniversalCamera("preview",new BABYLON.Vector3(0,1.65,-4.4),scene);
  previewCamera.setTarget(new BABYLON.Vector3(0,1.2,1.6));
  previewCamera.minZ=.04;
  scene.activeCamera=previewCamera;

  // ------------------------------------------------------------
  // Player / XR globals
  // ------------------------------------------------------------
  let xr=null, xrCamera=null;
  let playerHP=100;
  const PLAYER_MAX_HP=100;
  let playerDead=false;
  let playerInvuln=0;
  let deathTimer=0;
  let bodyVelocity=new BABYLON.Vector3(0,0,0);

  // Much lighter than previous versions.
  const PLAYER_GRAVITY = -2.15;
  const PUSH_GAIN = 1.48;
  const MAX_PLAYER_SPEED = 9.2;

  // ------------------------------------------------------------
  // Camera-fixed player HUD: always shows your own HP.
  // ------------------------------------------------------------
  const hudPlane = BABYLON.MeshBuilder.CreatePlane("playerHud",{width:1.05,height:.32},scene);
  hudPlane.setEnabled(false);
  const hudTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(hudPlane,900,280);

  const hudBg = new BABYLON.GUI.Rectangle();
  hudBg.cornerRadius=35;
  hudBg.color="white";
  hudBg.thickness=5;
  hudBg.background="#07111FEE";
  hudTex.addControl(hudBg);

  const hudStack = new BABYLON.GUI.StackPanel();
  hudStack.paddingTop="20px";
  hudStack.paddingBottom="20px";
  hudStack.paddingLeft="28px";
  hudStack.paddingRight="28px";
  hudBg.addControl(hudStack);

  const youHpText = new BABYLON.GUI.TextBlock();
  youHpText.text="YOU 100 HP";
  youHpText.color="white";
  youHpText.fontSize=64;
  youHpText.fontWeight="900";
  youHpText.height="100px";
  hudStack.addControl(youHpText);

  const hpBarBg = new BABYLON.GUI.Rectangle();
  hpBarBg.height="42px";
  hpBarBg.cornerRadius=20;
  hpBarBg.thickness=0;
  hpBarBg.background="#3f1d1d";
  hudStack.addControl(hpBarBg);

  const hpBar = new BABYLON.GUI.Rectangle();
  hpBar.horizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.width=1;
  hpBar.thickness=0;
  hpBar.cornerRadius=20;
  hpBar.background="#22c55e";
  hpBarBg.addControl(hpBar);

  const damageFlash = BABYLON.MeshBuilder.CreatePlane("damageFlash",{width:3.4,height:2.0},scene);
  damageFlash.setEnabled(false);
  const flashTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(damageFlash,800,450);
  const flashRect = new BABYLON.GUI.Rectangle();
  flashRect.thickness=24;
  flashRect.color="#ff3030";
  flashRect.background="#ff000025";
  flashRect.cornerRadius=40;
  flashTex.addControl(flashRect);
  let damageFlashTimer=0;

  const deathPlane = BABYLON.MeshBuilder.CreatePlane("deathPlane",{width:2.7,height:1.2},scene);
  deathPlane.setEnabled(false);
  const deathTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(deathPlane,1000,460);
  const deathBg = new BABYLON.GUI.Rectangle();
  deathBg.background="#220000EE";
  deathBg.color="#ff6666";
  deathBg.thickness=8;
  deathBg.cornerRadius=55;
  deathTex.addControl(deathBg);
  const deathText = new BABYLON.GUI.TextBlock();
  deathText.text="YOU DIED";
  deathText.color="white";
  deathText.fontSize=120;
  deathText.fontWeight="900";
  deathBg.addControl(deathText);

  function updatePlayerHud() {
    youHpText.text=`YOU ${Math.max(0,Math.ceil(playerHP))} HP`;
    hpBar.width=Math.max(.001,playerHP/PLAYER_MAX_HP);
    hpBar.background = playerHP>55 ? "#22c55e" : playerHP>25 ? "#f59e0b" : "#ef4444";
  }

  function attachHud() {
    if (!xrCamera) return;
    hudPlane.parent=xrCamera;
    hudPlane.position.set(-.52,-.42,1.25);
    hudPlane.rotation.set(0,Math.PI,0);
    hudPlane.setEnabled(true);

    damageFlash.parent=xrCamera;
    damageFlash.position.set(0,0,1.05);
    damageFlash.rotation.set(0,Math.PI,0);

    deathPlane.parent=xrCamera;
    deathPlane.position.set(0,0,1.45);
    deathPlane.rotation.set(0,Math.PI,0);
  }

  function hurtPlayer(amount, fromWorldPos) {
    if (playerDead || playerInvuln>0 || !xrCamera) return;
    playerHP=Math.max(0,playerHP-amount);
    playerInvuln=.42;
    damageFlashTimer=.18;
    damageFlash.setEnabled(true);

    let away=xrCamera.globalPosition.subtract(fromWorldPos);
    away.y=0;
    if (away.lengthSquared()<.001) away.set(0,0,-1);
    away.normalize();

    bodyVelocity.addInPlace(
      away.scale(4.7).add(new BABYLON.Vector3(0,1.35,0))
    );

    pulse(hands.left,.92,115);
    pulse(hands.right,.92,115);
    updatePlayerHud();

    if (playerHP<=0) {
      playerDead=true;
      deathTimer=3.0;
      deathPlane.setEnabled(true);
      hudPlane.setEnabled(false);
      chestRoot.setEnabled(false);
    }
  }

  function respawnPlayer() {
    playerHP=PLAYER_MAX_HP;
    playerDead=false;
    playerInvuln=1.5;
    deathPlane.setEnabled(false);
    hudPlane.setEnabled(true);
    bodyVelocity.set(0,0,0);
    if (xrCamera) xrCamera.position.set(0,0,-3.2);
    updatePlayerHud();
  }

  // ------------------------------------------------------------
  // Visible Gorilla-style compact torso.
  // ------------------------------------------------------------
  const chestRoot = new BABYLON.TransformNode("playerBodyRoot",scene);

  const chest = BABYLON.MeshBuilder.CreateCapsule("playerChest",{
    height:.52,radius:.24,tessellation:14
  },scene);
  chest.parent=chestRoot;
  chest.position.y=-.37;
  chest.material=MAT.accent;

  const belly = BABYLON.MeshBuilder.CreateSphere("playerBelly",{diameter:.42,segments:14},scene);
  belly.parent=chestRoot;
  belly.position.y=-.66;
  belly.scaling.y=.72;
  belly.material=MAT.accent;

  const shoulderL = BABYLON.MeshBuilder.CreateSphere("shoulderL",{diameter:.24,segments:12},scene);
  shoulderL.parent=chestRoot;
  shoulderL.position.set(-.22,-.22,0);
  shoulderL.material=MAT.accent;

  const shoulderR = shoulderL.clone("shoulderR");
  shoulderR.parent=chestRoot;
  shoulderR.position.x=.22;

  chestRoot.setEnabled(false);

  function updateBodyVisual() {
    if (!xrCamera || playerDead) {
      chestRoot.setEnabled(false);
      return;
    }
    chestRoot.setEnabled(true);

    const head=xrCamera.globalPosition.clone();
    let f=xrCamera.getForwardRay(1).direction.clone();
    f.y=0;
    if (f.lengthSquared()<.001) f.set(0,0,1);
    f.normalize();

    // Put the body a little in front of the headset, not behind it.
    // This makes it reliably visible when looking down.
    chestRoot.position.set(
      head.x + f.x*.08,
      head.y,
      head.z + f.z*.08
    );
    chestRoot.rotation.y=Math.atan2(f.x,f.z);
  }

  function keepRigAboveFloor() {
    if (!xrCamera) return;
    if (xrCamera.position.y<0) xrCamera.position.y=0;
    if (xrCamera.position.y<=.001 && bodyVelocity.y<0) {
      xrCamera.position.y=0;
      bodyVelocity.y=0;
    }
  }

  // ------------------------------------------------------------
  // Hands
  // ------------------------------------------------------------
  const hands={
    left:{controller:null,node:null,mesh:null,trackLast:null,contact:false,anchor:null,normal:null,plantTrack:null,waitClear:false},
    right:{controller:null,node:null,mesh:null,trackLast:null,contact:false,anchor:null,normal:null,plantTrack:null,waitClear:false}
  };

  function makeHand(side) {
    const root=new BABYLON.TransformNode(side+"Hand",scene);
    const m=side==="left"?MAT.handL:MAT.handR;

    const palm=BABYLON.MeshBuilder.CreateCapsule(side+"Palm",{height:.17,radius:.055,tessellation:12},scene);
    palm.parent=root;
    palm.rotation.x=Math.PI/2;
    palm.position.z=.025;
    palm.scaling.x=1.12;
    palm.scaling.y=.80;
    palm.material=m;

    const thumb=BABYLON.MeshBuilder.CreateCapsule(side+"Thumb",{height:.105,radius:.019,tessellation:10},scene);
    thumb.parent=root;
    thumb.rotation.x=.18;
    thumb.rotation.z=side==="left"?.72:-.72;
    thumb.position.x=side==="left"?.067:-.067;
    thumb.position.z=.005;
    thumb.material=m;

    for (let i=0;i<2;i++) {
      const f=BABYLON.MeshBuilder.CreateCapsule(side+"Finger"+i,{height:.14-i*.008,radius:.018,tessellation:10},scene);
      f.parent=root;
      f.rotation.x=Math.PI/2;
      f.position.x=i===0?-.028:.028;
      f.position.z=.13;
      f.material=m;
    }
    root.setEnabled(false);
    return root;
  }
  hands.left.mesh=makeHand("left");
  hands.right.mesh=makeHand("right");

  async function pulse(h,intensity,duration) {
    try {
      const gp=h?.controller?.inputSource?.gamepad;
      if (!gp) return;
      intensity=Math.max(0,Math.min(1,intensity));
      if (gp.hapticActuators?.[0]?.pulse) {
        await gp.hapticActuators[0].pulse(intensity,duration);
      } else if (gp.vibrationActuator?.playEffect) {
        await gp.vibrationActuator.playEffect("dual-rumble",{
          duration,strongMagnitude:intensity,weakMagnitude:intensity*.7
        });
      }
    } catch(_) {}
  }

  const HAND_RADIUS=.09;
  function closestPointAabb(p,mesh) {
    const bb=mesh.getBoundingInfo().boundingBox;
    const min=bb.minimumWorld,max=bb.maximumWorld;
    return new BABYLON.Vector3(
      Math.max(min.x,Math.min(max.x,p.x)),
      Math.max(min.y,Math.min(max.y,p.y)),
      Math.max(min.z,Math.min(max.z,p.z))
    );
  }

  function surfaceContact(pos,radius=HAND_RADIUS) {
    let best=null,bestD=Infinity;
    for (const s of collisionSurfaces) {
      s.computeWorldMatrix(true);
      const q=closestPointAabb(pos,s);
      const dv=pos.subtract(q);
      const d=dv.length();
      if (d>=radius || d>=bestD) continue;

      let normal;
      if (d>.0001) {
        normal=dv.scale(1/d);
      } else {
        const bb=s.getBoundingInfo().boundingBox;
        const min=bb.minimumWorld,max=bb.maximumWorld;
        const candidates=[
          {v:Math.abs(pos.x-min.x),n:new BABYLON.Vector3(-1,0,0)},
          {v:Math.abs(max.x-pos.x),n:new BABYLON.Vector3(1,0,0)},
          {v:Math.abs(pos.y-min.y),n:new BABYLON.Vector3(0,-1,0)},
          {v:Math.abs(max.y-pos.y),n:new BABYLON.Vector3(0,1,0)},
          {v:Math.abs(pos.z-min.z),n:new BABYLON.Vector3(0,0,-1)},
          {v:Math.abs(max.z-pos.z),n:new BABYLON.Vector3(0,0,1)}
        ].sort((a,b)=>a.v-b.v);
        normal=candidates[0].n;
      }
      bestD=d;
      best={surface:s,point:q,normal};
    }
    return best;
  }

  function controllerNode(c){ return c.grip||c.pointer; }
  function handWorld(h){ return h.node?.getAbsolutePosition().clone()||null; }
  function handTrack(h){ return h.node?.position?.clone()||handWorld(h); }

  function updateHandLocomotion(h,worldPos,trackPos,dt) {
    const c=surfaceContact(worldPos);

    if (h.waitClear && !c) h.waitClear=false;

    if (!h.contact && c && !h.waitClear) {
      h.contact=true;
      h.normal=c.normal.clone();
      h.anchor=c.point.add(h.normal.scale(HAND_RADIUS+.008));
      h.plantTrack=trackPos.clone();
      h.mesh.position.copyFrom(h.anchor);
      pulse(h,.35,30);
    }

    if (h.contact && h.normal && h.plantTrack && h.trackLast) {
      const n=h.normal;
      const fromPlant=trackPos.subtract(h.plantTrack);
      const outward=BABYLON.Vector3.Dot(fromPlant,n);

      // Fast reliable release: lift only ~2 cm away from the surface.
      if (outward>.020 || BABYLON.Vector3.Distance(worldPos,h.anchor)>.42) {
        h.contact=false;
        h.waitClear=!!c;
        h.normal=null;
        h.anchor=null;
        h.plantTrack=null;
      } else {
        const delta=trackPos.subtract(h.trackLast);
        const normalDelta=BABYLON.Vector3.Dot(delta,n);
        const tangent=delta.subtract(n.scale(normalDelta));
        const into=n.scale(Math.min(normalDelta,0));

        const effective=tangent.add(into.scale(1.18));
        let rigDelta=effective.scale(-PUSH_GAIN);
        const max=.095;
        if (rigDelta.length()>max) rigDelta=rigDelta.normalize().scale(max);

        if (rigDelta.length()>.0012) {
          xrCamera.position.addInPlace(rigDelta);
          keepRigAboveFloor();

          const impulse=rigDelta.scale(1/Math.max(dt,.008));
          bodyVelocity=BABYLON.Vector3.Lerp(bodyVelocity,impulse,.22);
          if (bodyVelocity.length()>MAX_PLAYER_SPEED) {
            bodyVelocity=bodyVelocity.normalize().scale(MAX_PLAYER_SPEED);
          }
        }
      }
    }

    if (h.contact && h.anchor) {
      h.mesh.position.copyFrom(h.anchor);
    } else {
      const vc=surfaceContact(worldPos);
      if (vc) h.mesh.position.copyFrom(vc.point.add(vc.normal.scale(HAND_RADIUS+.008)));
      else h.mesh.position.copyFrom(worldPos);
    }

    h.trackLast=trackPos.clone();
  }

  // ------------------------------------------------------------
  // Bat
  // ------------------------------------------------------------
  const batRoot=new BABYLON.TransformNode("batRoot",scene);
  const batBarrel=BABYLON.MeshBuilder.CreateCylinder("batBarrel",{
    height:.76,diameterTop:.10,diameterBottom:.066,tessellation:16
  },scene);
  batBarrel.parent=batRoot;
  batBarrel.rotation.x=Math.PI/2;
  batBarrel.position.z=.36;
  batBarrel.material=MAT.bat;

  const grip=BABYLON.MeshBuilder.CreateCylinder("batGrip",{height:.24,diameter:.055,tessellation:12},scene);
  grip.parent=batRoot;
  grip.rotation.x=Math.PI/2;
  grip.position.z=-.15;
  grip.material=MAT.grip;
  batRoot.setEnabled(false);

  let batTipLast=null;
  let batHitCooldown=0;
  function batTip() {
    return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0,0,.77),batRoot.getWorldMatrix());
  }

  function simpleHitSound(strong=false) {
    try {
      const ac=simpleHitSound.ctx||(simpleHitSound.ctx=new (window.AudioContext||window.webkitAudioContext)());
      const o=ac.createOscillator(),g=ac.createGain();
      o.type=strong?"sawtooth":"triangle";
      o.frequency.value=strong?70:125;
      g.gain.setValueAtTime(strong?.11:.055,ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+(strong?.18:.08));
      o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+(strong?.18:.08));
    } catch(_) {}
  }

  // ------------------------------------------------------------
  // NPC voice: no more embedded eSpeak robot audio.
  // Uses the best native browser/system voice the Quest exposes.
  // ------------------------------------------------------------
  let selectedVoice=null;
  function chooseVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices=speechSynthesis.getVoices();
    if (!voices.length) return;

    const english=voices.filter(v=>/^en[-_]/i.test(v.lang)||/English/i.test(v.name));
    const pool=english.length?english:voices;
    const scores=["Neural","Natural","Enhanced","Premium","Google","Microsoft","Samantha","Daniel","Alex"];
    selectedVoice=pool.sort((a,b)=>{
      const sa=scores.reduce((n,k)=>n+(a.name.includes(k)?2:0),0);
      const sb=scores.reduce((n,k)=>n+(b.name.includes(k)?2:0),0);
      return sb-sa;
    })[0]||pool[0];
  }
  chooseVoice();
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged=chooseVoice;

  const VOICE_LINES={
    chase:[
      "Hey! Get back here!",
      "Where do you think you're going?",
      "Come here!",
      "Stop running!"
    ],
    angry:[
      "Stop hitting me!",
      "Okay, now I'm mad!",
      "You really want to fight?",
      "That's enough!"
    ],
    hurt:[
      "Ow! That hurt!",
      "Ah! Seriously?",
      "Whoa! Easy!",
      "Ow! Stop!"
    ],
    scared:[
      "Whoa, okay! Stay back!",
      "No, no, no! Get away!",
      "Okay! I don't want to fight!",
      "Stay away from me!"
    ],
    attack:[
      "Got you!",
      "Take that!",
      "Come on!"
    ],
    death:[
      "No!",
      "Whoa!"
    ]
  };

  function speakNpc(kind,force=false) {
    if (!npc || npc.dead || !("speechSynthesis" in window)) return;
    if (!force && npc.speechCooldown>0) return;

    const lines=VOICE_LINES[kind]||VOICE_LINES.chase;
    const line=lines[Math.floor(Math.random()*lines.length)];
    npc.speechCooldown=1.8+Math.random()*1.8;
    npc.bubbleTimer=1.7;
    npc.speech.text.text=line;
    npc.speech.plane.setEnabled(true);

    try {
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(line);
      if (selectedVoice) u.voice=selectedVoice;
      u.volume=1;

      if (kind==="angry") { u.rate=1.08; u.pitch=.78; }
      else if (kind==="scared") { u.rate=1.18; u.pitch=1.20; }
      else if (kind==="hurt") { u.rate=1.10; u.pitch=1.10; }
      else if (kind==="attack") { u.rate=1.04; u.pitch=.86; }
      else { u.rate=.98; u.pitch=.96; }

      speechSynthesis.speak(u);
    } catch(_) {}
  }

  // ------------------------------------------------------------
  // NPC
  // ------------------------------------------------------------
  let npc=null;
  const NPC_RADIUS=.30;
  const NPC_HEIGHT=1.86;
  const NPC_GRAVITY=-6.4;

  function speechBubble(root) {
    const p=BABYLON.MeshBuilder.CreatePlane("npcSpeech",{width:1.65,height:.44},scene);
    p.parent=root;
    p.position.y=2.46;
    p.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
    const t=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(p,800,230);
    const r=new BABYLON.GUI.Rectangle();
    r.background="#111827E8";r.color="white";r.thickness=4;r.cornerRadius=35;
    t.addControl(r);
    const tx=new BABYLON.GUI.TextBlock();
    tx.color="white";tx.fontSize=52;tx.fontWeight="700";tx.textWrapping=true;
    r.addControl(tx);
    p.setEnabled(false);
    return {plane:p,text:tx};
  }

  function hpLabel(root) {
    const p=BABYLON.MeshBuilder.CreatePlane("npcHP",{width:1.0,height:.26},scene);
    p.parent=root;
    p.position.y=2.10;
    p.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
    const t=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(p,650,180);
    const r=new BABYLON.GUI.Rectangle();
    r.background="#111827EE";r.color="white";r.thickness=4;r.cornerRadius=28;
    t.addControl(r);
    const tx=new BABYLON.GUI.TextBlock();
    tx.text="100 HP";tx.color="white";tx.fontSize=68;tx.fontWeight="900";
    r.addControl(tx);
    return {plane:p,text:tx};
  }

  function createNpc() {
    const root=new BABYLON.TransformNode("npcRoot",scene);
    root.position=new BABYLON.Vector3(0,0,1.8);

    const visual=new BABYLON.TransformNode("npcVisual",scene);
    visual.parent=root;

    const torso=BABYLON.MeshBuilder.CreateCapsule("npcTorso",{height:.90,radius:.29,tessellation:16},scene);
    torso.parent=visual; torso.position.y=1.10; torso.material=MAT.npc;

    const pelvis=BABYLON.MeshBuilder.CreateSphere("npcPelvis",{diameter:.42,segments:12},scene);
    pelvis.parent=visual;pelvis.position.y=.67;pelvis.scaling.y=.65;pelvis.material=MAT.npc;

    const head=BABYLON.MeshBuilder.CreateSphere("npcHead",{diameter:.48,segments:16},scene);
    head.parent=visual;head.position.y=1.72;head.material=MAT.npc;

    function limb(name,x,y,h,r) {
      const m=BABYLON.MeshBuilder.CreateCapsule(name,{height:h,radius:r,tessellation:12},scene);
      m.parent=visual;m.position.set(x,y,0);m.material=MAT.npc;return m;
    }

    const leftArm=limb("leftArm",-.39,1.12,.70,.085);
    const rightArm=limb("rightArm",.39,1.12,.70,.085);
    const leftLeg=limb("leftLeg",-.15,.38,.76,.095);
    const rightLeg=limb("rightLeg",.15,.38,.76,.095);

    const speech=speechBubble(root);
    const hp=hpLabel(root);

    npc={
      root,visual,torso,pelvis,head,leftArm,rightArm,leftLeg,rightLeg,
      parts:[torso,pelvis,head,leftArm,rightArm,leftLeg,rightLeg],
      speech,hp,
      hpValue:100,
      maxHp:100,
      dead:false,
      velocity:new BABYLON.Vector3(0,0,0),
      angular:new BABYLON.Vector3(0,0,0),
      hitCooldown:0,
      attackCooldown:.5,
      attackAnim:0,
      walkPhase:0,
      speechCooldown:0,
      bubbleTimer:0,
      emotion:"normal",
      recentlyHit:0,
      respawnTimer:0,
      greeted:false
    };
  }
  createNpc();

  function updateNpcLabel() {
    if (npc) npc.hp.text.text=`${Math.max(0,Math.ceil(npc.hpValue))} HP`;
  }

  function setNpcMaterial() {
    if (!npc || npc.dead) return;
    let mat=MAT.npc;
    if (npc.recentlyHit>.0) mat=MAT.npcHit;
    else if (npc.emotion==="angry") mat=MAT.npcAngry;
    else if (npc.emotion==="scared") mat=MAT.npcScared;
    npc.parts.forEach(p=>p.material=mat);
  }

  function npcSphereHit(center,radius) {
    if (!npc || npc.dead) return false;
    const centers=[
      [new BABYLON.Vector3(0,1.10,0),.44],
      [new BABYLON.Vector3(0,1.72,0),.29],
      [new BABYLON.Vector3(-.15,.38,0),.19],
      [new BABYLON.Vector3(.15,.38,0),.19]
    ];
    return centers.some(([off,r])=>BABYLON.Vector3.Distance(center,npc.root.position.add(off))<radius+r);
  }

  function resolveNpcWorld(prevY) {
    if (!npc) return;
    if (npc.root.position.y<0) {
      npc.root.position.y=0;
      if (npc.velocity.y<0) npc.velocity.y=0;
    }

    for (const s of collisionSurfaces) {
      if (s===ground) continue;
      s.computeWorldMatrix(true);
      const bb=s.getBoundingInfo().boundingBox;
      const min=bb.minimumWorld,max=bb.maximumWorld;
      const p=npc.root.position;

      const bottom=p.y,top=p.y+NPC_HEIGHT;
      const prevTop=prevY+NPC_HEIGHT;

      const overlapXZ=
        p.x>min.x-NPC_RADIUS && p.x<max.x+NPC_RADIUS &&
        p.z>min.z-NPC_RADIUS && p.z<max.z+NPC_RADIUS;
      if (!overlapXZ) continue;

      if (npc.velocity.y<=0 && prevY>=max.y-.08 && bottom<max.y && top>max.y) {
        p.y=max.y;npc.velocity.y=0;continue;
      }
      if (npc.velocity.y>0 && prevTop<=min.y+.08 && top>min.y && bottom<min.y) {
        p.y=min.y-NPC_HEIGHT;npc.velocity.y=0;continue;
      }

      if (!(top>min.y && bottom<max.y)) continue;

      const options=[
        {v:Math.abs(p.x-(min.x-NPC_RADIUS)),axis:"x",pos:min.x-NPC_RADIUS,sign:-1},
        {v:Math.abs((max.x+NPC_RADIUS)-p.x),axis:"x",pos:max.x+NPC_RADIUS,sign:1},
        {v:Math.abs(p.z-(min.z-NPC_RADIUS)),axis:"z",pos:min.z-NPC_RADIUS,sign:-1},
        {v:Math.abs((max.z+NPC_RADIUS)-p.z),axis:"z",pos:max.z+NPC_RADIUS,sign:1}
      ].sort((a,b)=>a.v-b.v);

      const o=options[0];
      p[o.axis]=o.pos;

      // Strong wall response for final-hit flight.
      if (o.axis==="x") npc.velocity.x*=-.28;
      else npc.velocity.z*=-.28;
    }
  }

  function moveNpc(delta) {
    const steps=Math.max(1,Math.ceil(delta.length()/.065));
    const step=delta.scale(1/steps);
    for (let i=0;i<steps;i++) {
      const py=npc.root.position.y;
      npc.root.position.addInPlace(step);
      resolveNpcWorld(py);
    }
  }

  function finishNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead) return;
    npc.dead=true;
    npc.hpValue=0;
    npc.hp.plane.setEnabled(false);
    npc.speech.plane.setEnabled(false);
    speakNpc("death",true);

    let dir=swingVel.clone();
    if (dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    // Big final hit: whole body remains together and flies away.
    const force=Math.min(16.5,8.0+speed*.85);
    npc.velocity=dir.scale(force);
    npc.velocity.y+=2.2+Math.max(0,dir.y)*3.0;

    npc.angular.set(
      (Math.random()-.5)*5.5,
      (Math.random()-.5)*3.2,
      (Math.random()-.5)*6.0
    );
    npc.respawnTimer=3.7;

    pulse(hands.right,1,135);
    simpleHitSound(true);
  }

  function damageNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead || npc.hitCooldown>0) return;

    // Hits matter more: usually 3-5 solid swings to KO.
    const damage=Math.round(Math.max(18,Math.min(42,11+speed*4.6)));
    npc.hpValue-=damage;
    npc.hitCooldown=.20;
    npc.recentlyHit=.14;

    if (npc.hpValue<=0) {
      finishNpc(hitPos,swingVel,speed);
      return;
    }

    updateNpcLabel();

    let dir=swingVel.clone();
    if (dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    // Stronger normal-hit knockback.
    const force=Math.min(9.0,2.5+speed*.52);
    npc.velocity.addInPlace(dir.scale(force));
    npc.velocity.y+=Math.max(0,dir.y)*1.3;

    if (npc.hpValue<=35) {
      npc.emotion="scared";
      speakNpc("scared",true);
    } else {
      npc.emotion="angry";
      speakNpc(speed>3.2?"angry":"hurt",true);
    }

    pulse(hands.right,Math.min(1,.38+speed*.08),55+Math.min(55,speed*4));
    simpleHitSound(false);
  }

  // ------------------------------------------------------------
  // XR
  // ------------------------------------------------------------
  async function setupXR() {
    if (!navigator.xr) return;
    try {
      xr=await scene.createDefaultXRExperienceAsync({
        floorMeshes:[ground],
        disableTeleportation:true,
        disablePointerSelection:true,
        uiOptions:{sessionMode:"immersive-vr",referenceSpaceType:"local-floor"}
      });

      xrCamera=xr.baseExperience.camera;
      xrCamera.minZ=.04;
      xrCamera.position=new BABYLON.Vector3(0,0,-3.2);
      try{xr.teleportation?.dispose?.();}catch(_){}
      try{xr.pointerSelection?.dispose?.();}catch(_){}

      xr.input.onControllerAddedObservable.add(c=>{
        const side=c.inputSource.handedness;
        if (!hands[side]) return;
        const h=hands[side];
        h.controller=c;
        h.node=controllerNode(c);
        h.mesh.setEnabled(true);

        const hook=()=>{
          h.node=controllerNode(c);
          if (side==="right" && h.node) {
            batRoot.parent=h.node;
            batRoot.position.set(0,0,0);
            batRoot.rotationQuaternion=BABYLON.Quaternion.Identity();
            batRoot.setEnabled(true);
          }
        };
        c.onMotionControllerInitObservable.add(hook);
        hook();
      });

      xr.input.onControllerRemovedObservable.add(c=>{
        const side=c.inputSource.handedness;
        if (!hands[side]) return;
        const h=hands[side];
        h.controller=null;h.node=null;h.trackLast=null;
        h.contact=false;h.anchor=null;h.normal=null;h.plantTrack=null;h.waitClear=false;
        h.mesh.setEnabled(false);
        if(side==="right") batRoot.setEnabled(false);
      });

      xr.baseExperience.onStateChangedObservable.add(state=>{
        if (state===BABYLON.WebXRState.IN_XR) {
          attachHud();
          updatePlayerHud();
          chestRoot.setEnabled(true);
          bodyVelocity.set(0,0,0);
          for(const side of ["left","right"]) {
            hands[side].trackLast=null;
            hands[side].contact=false;
            hands[side].waitClear=false;
          }
          chooseVoice();
        }
      });
    } catch(e) {
      console.error(e);
    }
  }
  setupXR();

  // ------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------
  scene.onBeforeRenderObservable.add(()=>{
    const dt=Math.min(.033,engine.getDeltaTime()/1000);
    batHitCooldown=Math.max(0,batHitCooldown-dt);
    playerInvuln=Math.max(0,playerInvuln-dt);

    if (damageFlashTimer>0) {
      damageFlashTimer-=dt;
      if (damageFlashTimer<=0) damageFlash.setEnabled(false);
    }

    if (playerDead) {
      deathTimer-=dt;
      if (deathTimer<=0) respawnPlayer();
    }

    // NPC
    if (npc) {
      npc.hitCooldown=Math.max(0,npc.hitCooldown-dt);
      npc.attackCooldown=Math.max(0,npc.attackCooldown-dt);
      npc.attackAnim=Math.max(0,npc.attackAnim-dt);
      npc.recentlyHit=Math.max(0,npc.recentlyHit-dt);
      npc.speechCooldown=Math.max(0,npc.speechCooldown-dt);
      npc.bubbleTimer=Math.max(0,npc.bubbleTimer-dt);
      if (npc.bubbleTimer<=0) npc.speech.plane.setEnabled(false);

      if (!npc.dead) {
        setNpcMaterial();

        npc.velocity.y+=NPC_GRAVITY*dt;
        moveNpc(npc.velocity.scale(dt));
        npc.velocity.x*=Math.pow(.10,dt);
        npc.velocity.z*=Math.pow(.10,dt);

        if (xrCamera && !playerDead) {
          const toPlayer=xrCamera.globalPosition.subtract(npc.root.position);
          toPlayer.y=0;
          const d=toPlayer.length();
          let walking=false;

          if (!npc.greeted && d<5.5) {
            npc.greeted=true;
            speakNpc("chase",true);
          }

          if (npc.emotion==="scared" && d<4.2) {
            // Low-health NPC becomes genuinely afraid and tries to back away.
            walking=true;
            const away=toPlayer.lengthSquared()>.001?toPlayer.normalize().scale(-1):new BABYLON.Vector3(0,0,1);
            npc.root.rotation.y=Math.atan2(away.x,away.z);
            moveNpc(away.scale(.95*dt));

            if (npc.speechCooldown<=0 && Math.random()<.022) speakNpc("scared");
          } else if (d>1.20 && d<10) {
            walking=true;
            const dir=toPlayer.normalize();
            npc.root.rotation.y=Math.atan2(dir.x,dir.z);
            const speed=npc.emotion==="angry"?1.55:1.18;
            moveNpc(dir.scale(speed*dt));

            if (npc.speechCooldown<=0 && Math.random()<.014) {
              speakNpc(npc.emotion==="angry"?"angry":"chase");
            }
          }

          // Reliable attack range, with a visible lunge.
          if (d<=1.55 && npc.emotion!=="scared" && npc.attackCooldown<=0) {
            npc.attackCooldown=.85;
            npc.attackAnim=.34;
            speakNpc("attack",true);

            const lunge=toPlayer.lengthSquared()>.001?toPlayer.normalize():new BABYLON.Vector3(0,0,-1);
            moveNpc(lunge.scale(.18));

            hurtPlayer(15,npc.root.position);
          }

          if (walking) npc.walkPhase+=dt*8.5;
          const stride=walking?Math.sin(npc.walkPhase)*.48:0;
          npc.leftLeg.rotation.x=stride;
          npc.rightLeg.rotation.x=-stride;

          if (npc.attackAnim>0) {
            const t=Math.sin((.34-npc.attackAnim)/.34*Math.PI);
            npc.leftArm.rotation.x=-1.35*t;
            npc.rightArm.rotation.x=-1.35*t;
          } else {
            npc.leftArm.rotation.x=-stride*.65;
            npc.rightArm.rotation.x=stride*.65;
          }
        }
      } else {
        // Intact whole-body KO physics.
        npc.respawnTimer-=dt;
        npc.velocity.y+=NPC_GRAVITY*dt;
        moveNpc(npc.velocity.scale(dt));

        npc.velocity.x*=Math.pow(.26,dt);
        npc.velocity.z*=Math.pow(.26,dt);
        npc.angular.scaleInPlace(Math.pow(.18,dt));

        npc.visual.rotation.x+=npc.angular.x*dt;
        npc.visual.rotation.y+=npc.angular.y*dt;
        npc.visual.rotation.z+=npc.angular.z*dt;

        // Connected limbs "flop", but never detach.
        const flop=Math.min(1,npc.velocity.length()/7);
        npc.leftArm.rotation.z=Math.sin(performance.now()*.010)*.65*flop;
        npc.rightArm.rotation.z=-Math.sin(performance.now()*.011)*.65*flop;
        npc.leftLeg.rotation.x=Math.sin(performance.now()*.009)*.50*flop;
        npc.rightLeg.rotation.x=-Math.sin(performance.now()*.010)*.50*flop;

        if (npc.root.position.y<=.001 && Math.abs(npc.velocity.y)<.05) {
          npc.angular.scaleInPlace(.86);
          npc.visual.rotation.z=BABYLON.Scalar.Lerp(npc.visual.rotation.z,1.28,.05);
        }

        if (npc.respawnTimer<=0) {
          npc.root.dispose();
          createNpc();
          npc.root.position=new BABYLON.Vector3((Math.random()-.5)*2.6,0,1.7+Math.random()*1.2);
        }
      }
    }

    // XR player / hands / bat
    if (xrCamera && xr?.baseExperience?.state===BABYLON.WebXRState.IN_XR) {
      if (!playerDead) {
        for (const side of ["left","right"]) {
          const h=hands[side];
          if (!h.node) continue;
          const wp=handWorld(h),tp=handTrack(h);
          if (!wp||!tp) continue;

          updateHandLocomotion(h,wp,tp,dt);
          h.mesh.rotationQuaternion=h.node.absoluteRotationQuaternion?.clone()||BABYLON.Quaternion.Identity();
        }

        const planted=hands.left.contact||hands.right.contact;

        // Lower gravity and much longer air momentum.
        if (!planted) bodyVelocity.y+=PLAYER_GRAVITY*dt;
        else if (bodyVelocity.y<-.25) bodyVelocity.y=-.25;

        // Knockback/momentum always applies, including while hands are raised.
        xrCamera.position.addInPlace(bodyVelocity.scale(dt));

        const drag=planted?.13:.52;
        bodyVelocity.x*=Math.pow(drag,dt);
        bodyVelocity.z*=Math.pow(drag,dt);
        bodyVelocity.y*=Math.pow(.72,dt);

        if (bodyVelocity.length()>MAX_PLAYER_SPEED)
          bodyVelocity=bodyVelocity.normalize().scale(MAX_PLAYER_SPEED);

        keepRigAboveFloor();
        xrCamera.position.x=Math.max(-5.15,Math.min(5.15,xrCamera.position.x));
        xrCamera.position.z=Math.max(-5.05,Math.min(5.15,xrCamera.position.z));
        xrCamera.position.y=Math.min(4.2,xrCamera.position.y);

        updateBodyVisual();

        if (batRoot.isEnabled()) {
          const tip=batTip();
          if (batTipLast) {
            const vel=tip.subtract(batTipLast).scale(1/Math.max(dt,.008));
            const speed=vel.length();

            if (speed>1.15 && batHitCooldown<=0 && npcSphereHit(tip,.17)) {
              batHitCooldown=.20;
              damageNpc(tip,vel,speed);
            }

            const wc=surfaceContact(tip,.11);
            if (wc && speed>1.7 && batHitCooldown<=0) {
              batHitCooldown=.12;
              pulse(hands.right,Math.min(.85,.18+speed*.055),25+Math.min(50,speed*3));
              simpleHitSound(false);
            }
          }
          batTipLast=tip.clone();
        }
      } else {
        chestRoot.setEnabled(false);
      }
    }
  });

  engine.runRenderLoop(()=>scene.render());
  addEventListener("resize",()=>engine.resize());
})();