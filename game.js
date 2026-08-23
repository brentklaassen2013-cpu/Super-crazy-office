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
  const PLAYER_GRAVITY = -1.45;
  const PUSH_GAIN = 1.68;
  const MAX_PLAYER_SPEED = 9.6;

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
    if (xrCamera) {
      xrCamera.position.set(0,.08,-3.2);
      keepRigAboveFloor();
      resolvePlayerWorldCollision();
    }
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

    const topY=Math.max(.52,head.y-.18);
    const bottomY=Math.max(.25,head.y-.74);
    const bodyMid=(topY+bottomY)*.5;

    chestRoot.position.set(
      head.x + f.x*.07,
      bodyMid + .31,
      head.z + f.z*.07
    );
    chestRoot.rotation.y=Math.atan2(f.x,f.z);

    // If the real player crouches extremely low, compress visually rather
    // than allowing the torso to disappear below the virtual floor.
    const bodyHeight=Math.max(.35,topY-bottomY);
    chest.scaling.y=Math.min(1,bodyHeight/.56);
    belly.position.y=-Math.min(.66,bodyHeight+.10);
  }
  function keepRigAboveFloor() {
    if (!xrCamera) return;
    if (xrCamera.position.y<0) xrCamera.position.y=0;
    if (xrCamera.position.y<=.001 && bodyVelocity.y<0) {
      xrCamera.position.y=0;
      bodyVelocity.y=0;
    }
  }

  function playerSphereCorrection(center,radius) {
    let best=null;
    let bestLen=0;

    for (const s of collisionSurfaces) {
      s.computeWorldMatrix(true);
      const bb=s.getBoundingInfo().boundingBox;
      const min=bb.minimumWorld,max=bb.maximumWorld;

      const q=new BABYLON.Vector3(
        Math.max(min.x,Math.min(max.x,center.x)),
        Math.max(min.y,Math.min(max.y,center.y)),
        Math.max(min.z,Math.min(max.z,center.z))
      );

      let dv=center.subtract(q);
      let d=dv.length();

      if (d>=radius) continue;

      let n;
      if (d>.0001) {
        n=dv.scale(1/d);
      } else {
        const faces=[
          {v:Math.abs(center.x-min.x),n:new BABYLON.Vector3(-1,0,0)},
          {v:Math.abs(max.x-center.x),n:new BABYLON.Vector3(1,0,0)},
          {v:Math.abs(center.y-min.y),n:new BABYLON.Vector3(0,-1,0)},
          {v:Math.abs(max.y-center.y),n:new BABYLON.Vector3(0,1,0)},
          {v:Math.abs(center.z-min.z),n:new BABYLON.Vector3(0,0,-1)},
          {v:Math.abs(max.z-center.z),n:new BABYLON.Vector3(0,0,1)}
        ].sort((a,b)=>a.v-b.v);
        n=faces[0].n;
        d=0;
      }

      const c=n.scale(radius-d+.004);
      if (c.length()>bestLen) {
        best=c;
        bestLen=c.length();
      }
    }
    return best;
  }

  function playerHitSpheres() {
    if (!xrCamera) return [];
    const h=xrCamera.globalPosition.clone();
    return [
      {name:"head",center:h.clone(),radius:.135},
      {name:"chest",center:h.add(new BABYLON.Vector3(0,-.38,0)),radius:.23},
      {name:"hips",center:h.add(new BABYLON.Vector3(0,-.68,0)),radius:.19}
    ];
  }

  function resolvePlayerWorldCollision() {
    if (!xrCamera) return;

    // Multiple short iterations prevent head/body tunnelling into walls.
    for (let pass=0;pass<3;pass++) {
      let moved=false;
      const samples=playerHitSpheres();

      for (const s of samples) {
        const correction=playerSphereCorrection(s.center,s.radius);
        if (correction && correction.length()>.0005) {
          xrCamera.position.addInPlace(correction);
          moved=true;

          // Cancel velocity heading into the collision.
          const n=correction.normalize();
          const vn=BABYLON.Vector3.Dot(bodyVelocity,n);
          if (vn<0) bodyVelocity.subtractInPlace(n.scale(vn));
        }
      }
      if (!moved) break;
    }

    keepRigAboveFloor();
  }

  function segmentSphereHit(a,b,c,r) {
    const ab=b.subtract(a);
    const len2=ab.lengthSquared();
    if (len2<.000001) return BABYLON.Vector3.Distance(a,c)<=r;
    const t=Math.max(0,Math.min(1,BABYLON.Vector3.Dot(c.subtract(a),ab)/len2));
    const p=a.add(ab.scale(t));
    return BABYLON.Vector3.Distance(p,c)<=r;
  }

  function pointSegmentDistance(p,a,b) {
    const ab=b.subtract(a);
    const len2=ab.lengthSquared();
    if (len2<.000001) return BABYLON.Vector3.Distance(p,a);
    const t=Math.max(0,Math.min(1,BABYLON.Vector3.Dot(p.subtract(a),ab)/len2));
    return BABYLON.Vector3.Distance(p,a.add(ab.scale(t)));
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

  function batBase() {
    return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0,0,-.16),batRoot.getWorldMatrix());
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
      "Whoa... okay, okay!",
      "Hey! You're actually hurting me!",
      "Wait! Stop swinging that thing!",
      "Okay, this is getting bad!"
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

  const NPC_WEAPONS=[
    {name:"Pipe",damage:16,knockback:4.0,reach:.82},
    {name:"Hammer",damage:20,knockback:4.8,reach:.70},
    {name:"Frying Pan",damage:14,knockback:3.7,reach:.72},
    {name:"Broom",damage:12,knockback:3.4,reach:.94}
  ];

  function createNpcWeapon(visual) {
    const cfg=NPC_WEAPONS[Math.floor(Math.random()*NPC_WEAPONS.length)];
    const root=new BABYLON.TransformNode("npcWeaponRoot",scene);
    root.parent=visual;
    root.position.set(.43,1.17,0);

    const wm=mkMat("weaponMat"+Math.random(),"#9ca3af");
    const wood=mkMat("weaponWood"+Math.random(),"#8b5e3c");

    if (cfg.name==="Pipe") {
      const m=BABYLON.MeshBuilder.CreateCylinder("pipe",{height:.80,diameter:.065,tessellation:12},scene);
      m.parent=root;m.rotation.x=Math.PI/2;m.position.z=.40;m.material=wm;
    } else if (cfg.name==="Hammer") {
      const handle=BABYLON.MeshBuilder.CreateCylinder("hammerHandle",{height:.62,diameter:.055,tessellation:10},scene);
      handle.parent=root;handle.rotation.x=Math.PI/2;handle.position.z=.30;handle.material=wood;
      const head=BABYLON.MeshBuilder.CreateBox("hammerHead",{width:.27,height:.12,depth:.12},scene);
      head.parent=root;head.position.z=.63;head.material=wm;
    } else if (cfg.name==="Frying Pan") {
      const handle=BABYLON.MeshBuilder.CreateCylinder("panHandle",{height:.48,diameter:.05,tessellation:10},scene);
      handle.parent=root;handle.rotation.x=Math.PI/2;handle.position.z=.24;handle.material=wm;
      const pan=BABYLON.MeshBuilder.CreateCylinder("pan",{height:.055,diameter:.34,tessellation:18},scene);
      pan.parent=root;pan.rotation.x=Math.PI/2;pan.position.z=.57;pan.material=wm;
    } else {
      const broom=BABYLON.MeshBuilder.CreateCylinder("broomHandle",{height:.90,diameter:.045,tessellation:10},scene);
      broom.parent=root;broom.rotation.x=Math.PI/2;broom.position.z=.44;broom.material=wood;
      const brush=BABYLON.MeshBuilder.CreateBox("broomBrush",{width:.30,height:.12,depth:.12},scene);
      brush.parent=root;brush.position.z=.90;brush.material=wm;
    }

    const tip=new BABYLON.TransformNode("npcWeaponTip",scene);
    tip.parent=root;
    tip.position.z=cfg.reach;

    return {root,tip,cfg};
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
    const weapon=createNpcWeapon(visual);

    npc={
      root,visual,torso,pelvis,head,leftArm,rightArm,leftLeg,rightLeg,
      weaponRoot:weapon.root,weaponTip:weapon.tip,weaponCfg:weapon.cfg,
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
      attackDuration:.56,
      attackHasHit:false,
      attackBlocked:false,
      weaponPrevTip:null,
      stun:0,
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

  const deathParts=[];

  function resolveDeathPart(r) {
    const radius=r.radius||.15;
    for (const s of collisionSurfaces) {
      s.computeWorldMatrix(true);
      const bb=s.getBoundingInfo().boundingBox;
      const min=bb.minimumWorld,max=bb.maximumWorld;
      const p=r.mesh.position;

      const q=new BABYLON.Vector3(
        Math.max(min.x,Math.min(max.x,p.x)),
        Math.max(min.y,Math.min(max.y,p.y)),
        Math.max(min.z,Math.min(max.z,p.z))
      );

      let dv=p.subtract(q);
      let d=dv.length();
      if (d>=radius) continue;

      let n;
      if (d>.0001) n=dv.scale(1/d);
      else {
        const faces=[
          {v:Math.abs(p.x-min.x),n:new BABYLON.Vector3(-1,0,0)},
          {v:Math.abs(max.x-p.x),n:new BABYLON.Vector3(1,0,0)},
          {v:Math.abs(p.y-min.y),n:new BABYLON.Vector3(0,-1,0)},
          {v:Math.abs(max.y-p.y),n:new BABYLON.Vector3(0,1,0)},
          {v:Math.abs(p.z-min.z),n:new BABYLON.Vector3(0,0,-1)},
          {v:Math.abs(max.z-p.z),n:new BABYLON.Vector3(0,0,1)}
        ].sort((a,b)=>a.v-b.v);
        n=faces[0].n;d=0;
      }

      r.mesh.position.addInPlace(n.scale(radius-d+.003));
      const vn=BABYLON.Vector3.Dot(r.vel,n);
      if (vn<0) {
        r.vel.subtractInPlace(n.scale(vn*1.20));
        r.vel.scaleInPlace(.80);
      }
    }
  }

  function moveDeathPart(r,dt) {
    const delta=r.vel.scale(dt);
    const steps=Math.max(1,Math.ceil(delta.length()/.055));
    const step=delta.scale(1/steps);
    for(let i=0;i<steps;i++){
      r.mesh.position.addInPlace(step);
      resolveDeathPart(r);
    }
  }

  function spawnDeathRagdoll(origin,launchDir,force) {
    const specs=[
      {type:"capsule",r:.28,h:.72,off:[0,1.08,0]},
      {type:"sphere",d:.47,off:[0,1.70,0]},
      {type:"box",size:[.42,.24,.30],off:[0,.67,0]},
      {type:"capsule",r:.09,h:.39,off:[-.34,1.29,0]},
      {type:"capsule",r:.075,h:.36,off:[-.45,1.01,0]},
      {type:"capsule",r:.09,h:.39,off:[.34,1.29,0]},
      {type:"capsule",r:.075,h:.36,off:[.45,1.01,0]},
      {type:"capsule",r:.10,h:.44,off:[-.15,.43,0]},
      {type:"capsule",r:.085,h:.42,off:[-.15,.11,0]},
      {type:"capsule",r:.10,h:.44,off:[.15,.43,0]},
      {type:"capsule",r:.085,h:.42,off:[.15,.11,0]}
    ];

    for (const sp of specs) {
      let m,radius;
      if (sp.type==="sphere") {
        m=BABYLON.MeshBuilder.CreateSphere("deathPart",{diameter:sp.d,segments:12},scene);
        radius=sp.d*.5;
      } else if (sp.type==="box") {
        m=BABYLON.MeshBuilder.CreateBox("deathPart",{width:sp.size[0],height:sp.size[1],depth:sp.size[2]},scene);
        radius=Math.max(...sp.size)*.42;
      } else {
        m=BABYLON.MeshBuilder.CreateCapsule("deathPart",{radius:sp.r,height:sp.h,tessellation:12},scene);
        radius=Math.max(sp.r*1.2,sp.h*.28);
      }
      m.material=MAT.npc;
      m.position=origin.add(new BABYLON.Vector3(...sp.off));

      // All pieces initially travel together in the actual hit direction,
      // then separate with only modest random scatter.
      const scatter=new BABYLON.Vector3(
        (Math.random()-.5)*1.7,
        Math.random()*1.25,
        (Math.random()-.5)*1.7
      );
      const vel=launchDir.scale(force).add(scatter).add(new BABYLON.Vector3(0,2.0,0));

      deathParts.push({
        mesh:m,vel,radius,life:4.0,
        spin:new BABYLON.Vector3(
          (Math.random()-.5)*6,
          (Math.random()-.5)*6,
          (Math.random()-.5)*6
        )
      });
    }
  }

  function finishNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead) return;

    // Voice first, before marking dead.
    speakNpc("death",true);

    let dir=swingVel.clone();
    if (dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    const force=Math.min(17.0,7.5+speed*.95);
    const origin=npc.root.position.clone();

    npc.dead=true;
    npc.hpValue=0;
    npc.visual.setEnabled(false);
    npc.weaponRoot.setEnabled(false);
    npc.hp.plane.setEnabled(false);
    npc.speech.plane.setEnabled(false);
    npc.respawnTimer=4.0;

    spawnDeathRagdoll(origin,dir,force);

    pulse(hands.right,1,140);
    simpleHitSound(true);
  }

  function swingDamage(speed) {
    // Continuous curve: every change in swing speed can produce a different
    // damage value. Soft taps stay low; hard swings rise steeply.
    if (speed<.50) return 0;
    return Math.round(Math.max(2,Math.min(68,1.5 + 2.25*Math.pow(speed,1.55))));
  }

  function damageNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead || npc.hitCooldown>0) return;

    const damage=swingDamage(speed);
    if (damage<=0) return;

    npc.hpValue-=damage;
    npc.hitCooldown=.18;
    npc.recentlyHit=.14;

    if (npc.hpValue<=0) {
      finishNpc(hitPos,swingVel,speed);
      return;
    }

    npc.hp.text.text=`${Math.max(0,Math.ceil(npc.hpValue))} HP   -${damage}`;

    let dir=swingVel.clone();
    if (dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    const force=Math.min(11.0,.9 + speed*.68);
    npc.velocity.addInPlace(dir.scale(force));
    npc.velocity.y+=Math.max(0,dir.y)*1.5;

    if (npc.hpValue<=30) {
      npc.emotion="scared";
      speakNpc("scared",true);
    } else {
      npc.emotion="angry";
      speakNpc(speed>3.3?"angry":"hurt",true);
    }

    pulse(hands.right,Math.min(1,.22+speed*.09),35+Math.min(75,speed*5));
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
        npc.stun=Math.max(0,npc.stun-dt);

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

          // Even when scared, NPC never runs away. Fear only changes voice,
          // speed and hesitation.
          if (npc.stun<=0 && npc.attackAnim<=0 && d>1.35 && d<10) {
            walking=true;
            const dir=toPlayer.normalize();
            npc.root.rotation.y=Math.atan2(dir.x,dir.z);

            let speed=1.18;
            if (npc.emotion==="angry") speed=1.55;
            if (npc.emotion==="scared") speed=1.02;

            moveNpc(dir.scale(speed*dt));

            if (npc.speechCooldown<=0 && Math.random()<.014) {
              speakNpc(
                npc.emotion==="angry" ? "angry" :
                npc.emotion==="scared" ? "scared" : "chase"
              );
            }
          }

          // Start a real weapon swing, but distance alone does NOT deal damage.
          if (d<=1.95 && npc.stun<=0 && npc.attackAnim<=0 && npc.attackCooldown<=0) {
            npc.attackCooldown=1.05;
            npc.attackAnim=npc.attackDuration;
            npc.attackHasHit=false;
            npc.attackBlocked=false;
            npc.weaponPrevTip=npc.weaponTip.getAbsolutePosition().clone();
            speakNpc("attack",true);
          }

          // Animate weapon swing and use a swept hitbox.
          if (npc.attackAnim>0) {
            const progress=1-(npc.attackAnim/npc.attackDuration);
            npc.attackAnim=Math.max(0,npc.attackAnim-dt);

            // Wind-up -> fast strike -> follow-through.
            let angle;
            if (progress<.28) {
              angle=BABYLON.Scalar.Lerp(-1.15,-1.60,progress/.28);
            } else {
              angle=BABYLON.Scalar.Lerp(-1.60,.72,(progress-.28)/.72);
            }

            npc.rightArm.rotation.x=angle*.72;
            npc.weaponRoot.rotation.x=angle;

            const tip=npc.weaponTip.getAbsolutePosition().clone();
            const prev=npc.weaponPrevTip||tip;
            npc.weaponPrevTip=tip.clone();

            // You can block by putting your bat between yourself and the weapon.
            if (!npc.attackBlocked && batRoot.isEnabled()) {
              const bb=batBase(),bt=batTip();
              const blockDist=Math.min(
                pointSegmentDistance(tip,bb,bt),
                pointSegmentDistance(prev,bb,bt)
              );

              if (blockDist<.22 && progress>.30 && progress<.92) {
                npc.attackBlocked=true;
                npc.attackAnim=0;
                npc.stun=.48;
                npc.velocity.addInPlace(
                  npc.root.position.subtract(xrCamera.globalPosition)
                    .normalize().scale(1.8)
                );
                pulse(hands.right,.95,110);
                simpleHitSound(true);
                speakNpc("angry",true);
              }
            }

            // Actual body hitbox. If the weapon misses your head/chest/hips,
            // no damage is dealt, so leaning/ducking/stepping can dodge it.
            if (!npc.attackBlocked && !npc.attackHasHit && progress>.38) {
              const hit=playerHitSpheres().some(s=>
                segmentSphereHit(prev,tip,s.center,s.radius+.09)
              );

              if (hit) {
                npc.attackHasHit=true;
                const damage=npc.weaponCfg.damage;
                hurtPlayer(damage,npc.root.position);

                // Weapon-specific knockback.
                let away=xrCamera.globalPosition.subtract(npc.root.position);
                away.y=0;
                if (away.lengthSquared()<.001) away.set(0,0,-1);
                away.normalize();
                bodyVelocity.addInPlace(
                  away.scale(npc.weaponCfg.knockback)
                    .add(new BABYLON.Vector3(0,.65,0))
                );
              }
            }
          } else {
            npc.weaponRoot.rotation.x=.10;
          }

          if (walking) npc.walkPhase+=dt*8.5;
          const stride=walking?Math.sin(npc.walkPhase)*.48:0;
          npc.leftLeg.rotation.x=stride;
          npc.rightLeg.rotation.x=-stride;

          if (npc.attackAnim<=0) {
            npc.leftArm.rotation.x=-stride*.65;
            npc.rightArm.rotation.x=stride*.50;
          }
        }
      } else {
        npc.respawnTimer-=dt;
        if (npc.respawnTimer<=0) {
          npc.root.dispose();
          createNpc();
          npc.root.position=new BABYLON.Vector3((Math.random()-.5)*2.6,0,1.7+Math.random()*1.2);
        }
      }
    }

    // Detached KO body parts.
    for (let i=deathParts.length-1;i>=0;i--) {
      const r=deathParts[i];
      r.life-=dt;
      r.vel.y+=NPC_GRAVITY*dt;
      moveDeathPart(r,dt);

      r.mesh.rotation.x+=r.spin.x*dt;
      r.mesh.rotation.y+=r.spin.y*dt;
      r.mesh.rotation.z+=r.spin.z*dt;
      r.vel.x*=Math.pow(.60,dt);
      r.vel.z*=Math.pow(.60,dt);

      if (r.life<=0) {
        r.mesh.dispose();
        deathParts.splice(i,1);
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
        resolvePlayerWorldCollision();
        xrCamera.position.x=Math.max(-5.15,Math.min(5.15,xrCamera.position.x));
        xrCamera.position.z=Math.max(-5.05,Math.min(5.15,xrCamera.position.z));
        xrCamera.position.y=Math.min(4.2,xrCamera.position.y);

        updateBodyVisual();

        if (batRoot.isEnabled()) {
          const tip=batTip();
          if (batTipLast) {
            const vel=tip.subtract(batTipLast).scale(1/Math.max(dt,.008));
            const speed=vel.length();

            if (speed>.50 && batHitCooldown<=0 && npcSphereHit(tip,.17)) {
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