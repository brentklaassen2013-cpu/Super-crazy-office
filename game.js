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
  const PLAYER_GRAVITY = -0.92;
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
      away.scale(2.8).add(new BABYLON.Vector3(0,.72,0))
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

    const topY=Math.max(.64,head.y-.16);
    const bottomY=Math.max(.46,head.y-.56);
    const bodyMid=(topY+bottomY)*.5;

    chestRoot.position.set(
      head.x + f.x*.08,
      bodyMid + .27,
      head.z + f.z*.08
    );
    chestRoot.rotation.y=Math.atan2(f.x,f.z);

    // If the real player crouches extremely low, compress visually rather
    // than allowing the torso to disappear below the virtual floor.
    const bodyHeight=Math.max(.28,topY-bottomY);
    chest.scaling.y=Math.min(.92,bodyHeight/.50);
    belly.position.y=-Math.min(.48,bodyHeight+.05);
    belly.scaling.y=.58;
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
  // Detailed player bat
  // ------------------------------------------------------------
  const batRoot=new BABYLON.TransformNode("batRoot",scene);

  const batWood=mkMat("batWood","#b9783e");
  const batDark=mkMat("batDark","#4b2d18");
  const batMetal=mkMat("batMetal","#cbd5e1");
  const batTape=mkMat("batTape","#1f2937");

  const batBarrel=BABYLON.MeshBuilder.CreateCylinder("batBarrel",{
    height:.78,diameterTop:.115,diameterBottom:.078,tessellation:20
  },scene);
  batBarrel.parent=batRoot;
  batBarrel.rotation.x=Math.PI/2;
  batBarrel.position.z=.37;
  batBarrel.material=batWood;

  const batTipCap=BABYLON.MeshBuilder.CreateSphere("batTipCap",{
    diameter:.118,segments:16
  },scene);
  batTipCap.parent=batRoot;
  batTipCap.position.z=.765;
  batTipCap.scaling.z=.62;
  batTipCap.material=batWood;

  const batNeck=BABYLON.MeshBuilder.CreateCylinder("batNeck",{
    height:.14,diameterTop:.078,diameterBottom:.058,tessellation:16
  },scene);
  batNeck.parent=batRoot;
  batNeck.rotation.x=Math.PI/2;
  batNeck.position.z=-.07;
  batNeck.material=batDark;

  const grip=BABYLON.MeshBuilder.CreateCylinder("batGrip",{
    height:.29,diameter:.061,tessellation:14
  },scene);
  grip.parent=batRoot;
  grip.rotation.x=Math.PI/2;
  grip.position.z=-.245;
  grip.material=batTape;

  // Grip rings for extra detail.
  for(let i=0;i<5;i++){
    const ring=BABYLON.MeshBuilder.CreateTorus("gripRing"+i,{
      diameter:.067,thickness:.007,tessellation:14
    },scene);
    ring.parent=batRoot;
    ring.rotation.x=Math.PI/2;
    ring.position.z=-.12-i*.055;
    ring.material=batDark;
  }

  const metalRing=BABYLON.MeshBuilder.CreateTorus("metalRing",{
    diameter:.082,thickness:.010,tessellation:18
  },scene);
  metalRing.parent=batRoot;
  metalRing.rotation.x=Math.PI/2;
  metalRing.position.z=-.095;
  metalRing.material=batMetal;

  const knob=BABYLON.MeshBuilder.CreateSphere("batKnob",{
    diameter:.09,segments:14
  },scene);
  knob.parent=batRoot;
  knob.position.z=-.405;
  knob.scaling.z=.65;
  knob.material=batDark;

  batRoot.setEnabled(false);

  let batTipLast=null;
  let batHitCooldown=0;
  function batTip() {
    return BABYLON.Vector3.TransformCoordinates(
      new BABYLON.Vector3(0,0,.825),
      batRoot.getWorldMatrix()
    );
  }

  function batBase() {
    return BABYLON.Vector3.TransformCoordinates(
      new BABYLON.Vector3(0,0,-.42),
      batRoot.getWorldMatrix()
    );
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
    tx.text="160 HP";tx.color="white";tx.fontSize=68;tx.fontWeight="900";
    r.addControl(tx);
    return {plane:p,text:tx};
  }

  const NPC_WEAPONS=[
    {name:"Pipe",damage:18,knockback:2.7,reach:.86},
    {name:"Hammer",damage:23,knockback:3.2,reach:.74},
    {name:"Frying Pan",damage:17,knockback:2.5,reach:.76},
    {name:"Broom",damage:15,knockback:2.3,reach:.98}
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


  // ------------------------------------------------------------
  // Active ragdoll NPC physics
  // ------------------------------------------------------------
  function rotY(v,a){
    const c=Math.cos(a),s=Math.sin(a);
    return new BABYLON.Vector3(
      v.x*c + v.z*s,
      v.y,
      -v.x*s + v.z*c
    );
  }

  function npcLocalToWorld(v){
    return npc.root.position.add(rotY(v,npc.root.rotation.y));
  }

  function worldVectorToNpcLocal(v){
    return rotY(v,-npc.root.rotation.y);
  }

  function ragPoint(name,x,y,z,radius=.10,invMass=1){
    const p=new BABYLON.Vector3(x,y,z);
    return {
      name,
      pos:p.clone(),
      prev:p.clone(),
      base:p.clone(),
      radius,
      invMass
    };
  }

  function ragConstraint(a,b,stiffness=1){
    return {
      a,b,
      len:BABYLON.Vector3.Distance(a.pos,b.pos),
      stiffness
    };
  }

  function makeNpcRagdoll(){
    const p={
      pelvis:ragPoint("pelvis",0,.67,0,.18,.55),
      chest:ragPoint("chest",0,1.18,0,.20,.45),
      head:ragPoint("head",0,1.72,0,.23,.72),

      lShoulder:ragPoint("lShoulder",-.30,1.34,0,.10,.85),
      lElbow:ragPoint("lElbow",-.46,1.08,.01,.09,1),
      lHand:ragPoint("lHand",-.49,.83,.04,.09,1),

      rShoulder:ragPoint("rShoulder",.30,1.34,0,.10,.85),
      rElbow:ragPoint("rElbow",.46,1.08,.01,.09,1),
      rHand:ragPoint("rHand",.49,.83,.04,.09,1),

      lHip:ragPoint("lHip",-.14,.63,0,.11,.75),
      lKnee:ragPoint("lKnee",-.14,.34,.02,.10,.95),
      lFoot:ragPoint("lFoot",-.14,.10,.12,.11,1),

      rHip:ragPoint("rHip",.14,.63,0,.11,.75),
      rKnee:ragPoint("rKnee",.14,.34,.02,.10,.95),
      rFoot:ragPoint("rFoot",.14,.10,.12,.11,1)
    };

    const constraints=[
      ragConstraint(p.pelvis,p.chest,1),
      ragConstraint(p.chest,p.head,.98),

      ragConstraint(p.chest,p.lShoulder,.98),
      ragConstraint(p.lShoulder,p.lElbow,.98),
      ragConstraint(p.lElbow,p.lHand,.98),

      ragConstraint(p.chest,p.rShoulder,.98),
      ragConstraint(p.rShoulder,p.rElbow,.98),
      ragConstraint(p.rElbow,p.rHand,.98),

      ragConstraint(p.pelvis,p.lHip,.98),
      ragConstraint(p.lHip,p.lKnee,.99),
      ragConstraint(p.lKnee,p.lFoot,.99),

      ragConstraint(p.pelvis,p.rHip,.98),
      ragConstraint(p.rHip,p.rKnee,.99),
      ragConstraint(p.rKnee,p.rFoot,.99),

      // Structural braces keep the active ragdoll human-shaped without
      // making it perfectly rigid.
      ragConstraint(p.lShoulder,p.rShoulder,.94),
      ragConstraint(p.lHip,p.rHip,.96),
      ragConstraint(p.lShoulder,p.rHip,.84),
      ragConstraint(p.rShoulder,p.lHip,.84),
      ragConstraint(p.head,p.lShoulder,.76),
      ragConstraint(p.head,p.rShoulder,.76)
    ];

    return {
      points:p,
      list:Object.values(p),
      constraints,
      activeStrength:1,
      dead:false
    };
  }

  function setSegment(mesh,a,b,baseHeight=1){
    const d=b.subtract(a);
    const len=Math.max(.001,d.length());
    const dir=d.scale(1/len);

    mesh.position.copyFrom(a.add(b).scale(.5));
    mesh.scaling.y=len/baseHeight;

    const up=new BABYLON.Vector3(0,1,0);
    let axis=BABYLON.Vector3.Cross(up,dir);
    const dot=BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(up,dir),-1,1);
    const angle=Math.acos(dot);

    if(axis.lengthSquared()<.000001){
      if(dot<0) mesh.rotationQuaternion=BABYLON.Quaternion.RotationAxis(
        new BABYLON.Vector3(1,0,0),Math.PI
      );
      else mesh.rotationQuaternion=BABYLON.Quaternion.Identity();
    }else{
      axis.normalize();
      mesh.rotationQuaternion=BABYLON.Quaternion.RotationAxis(axis,angle);
    }
  }

  function ragTarget(name){
    const rd=npc.ragdoll;
    const base=rd.points[name].base.clone();

    if(npc.dead) return base;

    const walking=npc.walkingNow ? 1 : 0;
    const phase=npc.walkPhase;
    const stride=Math.sin(phase)*.16*walking;
    const lift=Math.max(0,Math.sin(phase))* .055*walking;
    const liftOpp=Math.max(0,-Math.sin(phase))* .055*walking;

    if(name==="lFoot"){
      base.z+=stride;
      base.y+=lift;
    }else if(name==="rFoot"){
      base.z-=stride;
      base.y+=liftOpp;
    }else if(name==="lKnee"){
      base.z+=stride*.48;
      base.y+=lift*.55;
    }else if(name==="rKnee"){
      base.z-=stride*.48;
      base.y+=liftOpp*.55;
    }else if(name==="lHand"){
      base.z-=stride*.55;
    }else if(name==="rHand"){
      base.z+=stride*.55;
    }else if(name==="lElbow"){
      base.z-=stride*.30;
    }else if(name==="rElbow"){
      base.z+=stride*.30;
    }

    // Right arm follows the attack in a springy way instead of being a
    // completely rigid animation.
    if(npc.attackAnim>0){
      const progress=1-(npc.attackAnim/npc.attackDuration);
      if(name==="rHand"){
        const arc=Math.sin(progress*Math.PI);
        base.x=.44;
        base.y=1.02 + arc*.13;
        base.z=.08 + progress*.38;
      }else if(name==="rElbow"){
        const arc=Math.sin(progress*Math.PI);
        base.x=.39;
        base.y=1.18 + arc*.08;
        base.z=.03 + progress*.18;
      }
    }

    return base;
  }

  function solveRagConstraint(c){
    const a=c.a,b=c.b;
    const d=b.pos.subtract(a.pos);
    const len=d.length();
    if(len<.000001) return;

    const error=(len-c.len)/len;
    const wa=a.invMass,wb=b.invMass;
    const sum=wa+wb;
    if(sum<=0) return;

    const corr=d.scale(error*c.stiffness);
    a.pos.addInPlace(corr.scale(wa/sum));
    b.pos.subtractInPlace(corr.scale(wb/sum));
  }

  function collideNpcRagdollPoint(p){
    const world=npcLocalToWorld(p.pos);
    const correction=playerSphereCorrection(world,p.radius);
    if(!correction) return;

    const localCorrection=worldVectorToNpcLocal(correction);
    p.pos.addInPlace(localCorrection);

    // Moving some of the correction into previous position kills the
    // trampoline/bounce effect while preserving impact motion.
    p.prev.addInPlace(localCorrection.scale(.72));
  }

  function updateNpcRagdoll(dt,active){
    if(!npc?.ragdoll) return;

    const rd=npc.ragdoll;
    const frame=Math.min(1.4,dt*60);
    const gravity=active ? -4.8 : -7.1;
    const damping=active ? .91 : .965;

    let strength=.18;
    if(npc.stun>0) strength=.045;
    else if(npc.recentlyHit>0) strength=.075;
    else if(npc.emotion==="angry") strength=.21;
    else if(npc.emotion==="scared") strength=.14;

    for(const p of rd.list){
      const vel=p.pos.subtract(p.prev).scale(damping);
      p.prev.copyFrom(p.pos);
      p.pos.addInPlace(vel);
      p.pos.y+=gravity*dt*dt;

      if(active){
        const target=ragTarget(p.name);
        const localStrength=
          (p.name==="pelvis" || p.name==="chest") ? strength*1.35 :
          p.name==="head" ? strength*1.12 :
          strength;

        p.pos.addInPlace(
          target.subtract(p.pos).scale(localStrength*frame)
        );
      }
    }

    // More iterations = tighter joints. Five is a good Quest 2 compromise.
    for(let iteration=0;iteration<5;iteration++){
      for(const c of rd.constraints) solveRagConstraint(c);
      for(const p of rd.list) collideNpcRagdollPoint(p);
    }

    updateNpcRagdollMeshes();
  }

  function updateNpcRagdollMeshes(){
    if(!npc?.ragdoll) return;
    const p=npc.ragdoll.points;

    setSegment(npc.torso,p.pelvis.pos,p.chest.pos,1);
    npc.chestPlate.position.copyFrom(p.chest.pos);
    npc.pelvis.position.copyFrom(p.pelvis.pos);
    npc.head.position.copyFrom(p.head.pos);

    setSegment(npc.leftUpperArm,p.lShoulder.pos,p.lElbow.pos,1);
    setSegment(npc.leftLowerArm,p.lElbow.pos,p.lHand.pos,1);
    npc.leftHand.position.copyFrom(p.lHand.pos);

    setSegment(npc.rightUpperArm,p.rShoulder.pos,p.rElbow.pos,1);
    setSegment(npc.rightLowerArm,p.rElbow.pos,p.rHand.pos,1);
    npc.rightHand.position.copyFrom(p.rHand.pos);

    setSegment(npc.leftUpperLeg,p.lHip.pos,p.lKnee.pos,1);
    setSegment(npc.leftLowerLeg,p.lKnee.pos,p.lFoot.pos,1);
    npc.leftShoe.position.copyFrom(p.lFoot.pos);

    setSegment(npc.rightUpperLeg,p.rHip.pos,p.rKnee.pos,1);
    setSegment(npc.rightLowerLeg,p.rKnee.pos,p.rFoot.pos,1);
    npc.rightShoe.position.copyFrom(p.rFoot.pos);

    // Face follows the head point.
    npc.nose.position.copyFrom(p.head.pos.add(new BABYLON.Vector3(0,-.03,.245)));
    npc.leftEye.position.copyFrom(p.head.pos.add(new BABYLON.Vector3(-.085,.08,.225)));
    npc.rightEye.position.copyFrom(p.head.pos.add(new BABYLON.Vector3(.085,.08,.225)));
    npc.mouth.position.copyFrom(p.head.pos.add(new BABYLON.Vector3(0,-.11,.242)));

    // Weapon is physically attached to the ragdoll right hand.
    npc.weaponRoot.position.copyFrom(p.rHand.pos);
  }

  function applyNpcRagdollImpulse(hitWorld,impulseWorld,radius=1.0){
    if(!npc?.ragdoll) return;

    const impulseLocal=worldVectorToNpcLocal(impulseWorld);

    for(const p of npc.ragdoll.list){
      const w=npcLocalToWorld(p.pos);
      const dist=BABYLON.Vector3.Distance(w,hitWorld);
      if(dist>radius) continue;

      const falloff=1-dist/radius;
      const massScale=.55+p.invMass*.55;

      // Verlet impulse: changing prev creates instantaneous velocity.
      p.prev.subtractInPlace(
        impulseLocal.scale(.020*falloff*massScale)
      );
    }
  }

  function createNpc() {
    const root=new BABYLON.TransformNode("npcRoot",scene);
    root.position=new BABYLON.Vector3(0,0,1.8);

    const visual=new BABYLON.TransformNode("npcVisual",scene);
    visual.parent=root;

    const skinMat=mkMat("npcSkin"+Math.random(),"#e8a06f");
    const shirtMat=mkMat("npcShirt"+Math.random(),"#f59a3d");
    const pantsMat=mkMat("npcPants"+Math.random(),"#334155");
    const shoeMat=mkMat("npcShoes"+Math.random(),"#111827");
    const eyeMat=mkMat("npcEyes"+Math.random(),"#111111");

    function capsule(name,radius,material){
      const m=BABYLON.MeshBuilder.CreateCapsule(name,{
        height:1,radius,tessellation:14
      },scene);
      m.parent=visual;
      m.material=material;
      m.rotationQuaternion=BABYLON.Quaternion.Identity();
      return m;
    }

    const torso=capsule("npcTorso",.285,shirtMat);

    const chestPlate=BABYLON.MeshBuilder.CreateSphere("npcChest",{
      diameter:.54,segments:16
    },scene);
    chestPlate.parent=visual;
    chestPlate.scaling.set(1,.72,.68);
    chestPlate.material=shirtMat;

    const pelvis=BABYLON.MeshBuilder.CreateSphere("npcPelvis",{
      diameter:.43,segments:14
    },scene);
    pelvis.parent=visual;
    pelvis.scaling.y=.62;
    pelvis.material=pantsMat;

    const head=BABYLON.MeshBuilder.CreateSphere("npcHead",{
      diameter:.49,segments:18
    },scene);
    head.parent=visual;
    head.material=skinMat;

    const nose=BABYLON.MeshBuilder.CreateSphere("npcNose",{
      diameter:.09,segments:10
    },scene);
    nose.parent=visual;
    nose.scaling.z=1.25;
    nose.material=skinMat;

    const leftEye=BABYLON.MeshBuilder.CreateSphere("npcLeftEye",{
      diameter:.055,segments:10
    },scene);
    leftEye.parent=visual;
    leftEye.scaling.z=.55;
    leftEye.material=eyeMat;

    const rightEye=leftEye.clone("npcRightEye");
    rightEye.parent=visual;

    const mouth=BABYLON.MeshBuilder.CreateBox("npcMouth",{
      width:.13,height:.025,depth:.012
    },scene);
    mouth.parent=visual;
    mouth.material=eyeMat;

    const leftUpperArm=capsule("leftUpperArm",.088,skinMat);
    const leftLowerArm=capsule("leftLowerArm",.077,skinMat);
    const rightUpperArm=capsule("rightUpperArm",.088,skinMat);
    const rightLowerArm=capsule("rightLowerArm",.077,skinMat);

    const leftHand=BABYLON.MeshBuilder.CreateSphere("leftHand",{
      diameter:.17,segments:12
    },scene);
    leftHand.parent=visual;
    leftHand.material=skinMat;

    const rightHand=leftHand.clone("rightHand");
    rightHand.parent=visual;

    const leftUpperLeg=capsule("leftUpperLeg",.105,pantsMat);
    const leftLowerLeg=capsule("leftLowerLeg",.090,pantsMat);
    const rightUpperLeg=capsule("rightUpperLeg",.105,pantsMat);
    const rightLowerLeg=capsule("rightLowerLeg",.090,pantsMat);

    const leftShoe=BABYLON.MeshBuilder.CreateBox("leftShoe",{
      width:.20,height:.12,depth:.32
    },scene);
    leftShoe.parent=visual;
    leftShoe.material=shoeMat;

    const rightShoe=leftShoe.clone("rightShoe");
    rightShoe.parent=visual;

    const speech=speechBubble(root);
    const hp=hpLabel(root);
    const weapon=createNpcWeapon(visual);

    npc={
      root,visual,
      torso,chestPlate,pelvis,head,nose,leftEye,rightEye,mouth,
      leftUpperArm,leftLowerArm,leftHand,
      rightUpperArm,rightLowerArm,rightHand,
      leftUpperLeg,leftLowerLeg,leftShoe,
      rightUpperLeg,rightLowerLeg,rightShoe,

      parts:[
        torso,chestPlate,pelvis,head,nose,leftEye,rightEye,mouth,
        leftUpperArm,leftLowerArm,leftHand,
        rightUpperArm,rightLowerArm,rightHand,
        leftUpperLeg,leftLowerLeg,leftShoe,
        rightUpperLeg,rightLowerLeg,rightShoe
      ],

      skinParts:[
        head,nose,leftUpperArm,leftLowerArm,leftHand,
        rightUpperArm,rightLowerArm,rightHand
      ],
      shirtParts:[torso,chestPlate],
      pantsParts:[pelvis,leftUpperLeg,leftLowerLeg,rightUpperLeg,rightLowerLeg],
      shoeParts:[leftShoe,rightShoe],

      skinMat,shirtMat,pantsMat,shoeMat,eyeMat,
      speech,hp,
      weaponRoot:weapon.root,weaponTip:weapon.tip,weaponCfg:weapon.cfg,

      hpValue:160,
      maxHp:160,
      dead:false,
      velocity:new BABYLON.Vector3(0,0,0),
      angular:new BABYLON.Vector3(0,0,0),
      hitCooldown:0,
      attackCooldown:.35,
      attackAnim:0,
      attackDuration:.48,
      attackHasHit:false,
      attackBlocked:false,
      weaponPrevTip:null,
      stun:0,
      walkPhase:0,
      walkingNow:false,
      speechCooldown:0,
      bubbleTimer:0,
      emotion:"normal",
      recentlyHit:0,
      respawnTimer:0,
      greeted:false,
      deathDelay:0,
      ragdoll:null
    };

    npc.ragdoll=makeNpcRagdoll();
    npc.hp.text.text="160 HP";
    updateNpcRagdollMeshes();
  }

  function updateNpcLabel() {
    if (npc) npc.hp.text.text=`${Math.max(0,Math.ceil(npc.hpValue))} HP`;
  }

  function setNpcMaterial() {
    if (!npc || npc.dead) return;

    if(npc.recentlyHit>0){
      npc.skinParts.forEach(p=>p.material=MAT.npcHit);
      npc.shirtParts.forEach(p=>p.material=MAT.npcHit);
      npc.pantsParts.forEach(p=>p.material=MAT.npcHit);
      return;
    }

    npc.skinParts.forEach(p=>p.material=npc.skinMat);
    npc.shirtParts.forEach(p=>p.material=npc.shirtMat);
    npc.pantsParts.forEach(p=>p.material=npc.pantsMat);
    npc.shoeParts.forEach(p=>p.material=npc.shoeMat);
    npc.leftEye.material=npc.eyeMat;
    npc.rightEye.material=npc.eyeMat;
    npc.mouth.material=npc.eyeMat;

    // Emotion still shows subtly through the chest instead of recoloring
    // the entire person unnaturally.
    if(npc.emotion==="angry") npc.chestPlate.material=MAT.npcAngry;
    else if(npc.emotion==="scared") npc.chestPlate.material=MAT.npcScared;
  }
  function npcSphereHit(center,radius) {
    if (!npc || npc.dead || !npc.ragdoll) return false;

    return npc.ragdoll.list.some(p=>{
      const w=npcLocalToWorld(p.pos);
      return BABYLON.Vector3.Distance(center,w)<radius+p.radius;
    });
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
      {type:"capsule",r:.29,h:.74,off:[0,1.08,0],scale:[1,1,1]},
      {type:"sphere",d:.48,off:[0,1.71,0],scale:[1,1,1]},
      {type:"box",size:[.43,.25,.31],off:[0,.67,0],scale:[1,1,1]},

      {type:"capsule",r:.095,h:.40,off:[-.34,1.30,0],scale:[1,1,1]},
      {type:"capsule",r:.078,h:.37,off:[-.47,1.02,0],scale:[1,1,1]},
      {type:"sphere",d:.16,off:[-.49,.80,.02],scale:[.85,.70,1.15]},

      {type:"capsule",r:.095,h:.40,off:[.34,1.30,0],scale:[1,1,1]},
      {type:"capsule",r:.078,h:.37,off:[.47,1.02,0],scale:[1,1,1]},
      {type:"sphere",d:.16,off:[.49,.80,.02],scale:[.85,.70,1.15]},

      {type:"capsule",r:.105,h:.46,off:[-.15,.43,0],scale:[1,1,1]},
      {type:"capsule",r:.088,h:.43,off:[-.15,.10,0],scale:[1,1,1]},
      {type:"box",size:[.19,.11,.30],off:[-.15,-.14,.08],scale:[1,1,1]},

      {type:"capsule",r:.105,h:.46,off:[.15,.43,0],scale:[1,1,1]},
      {type:"capsule",r:.088,h:.43,off:[.15,.10,0],scale:[1,1,1]},
      {type:"box",size:[.19,.11,.30],off:[.15,-.14,.08],scale:[1,1,1]}
    ];

    for(const sp of specs){
      let m,radius;

      if(sp.type==="sphere"){
        m=BABYLON.MeshBuilder.CreateSphere("deathPart",{
          diameter:sp.d,segments:14
        },scene);
        radius=sp.d*.5;
      } else if(sp.type==="box"){
        m=BABYLON.MeshBuilder.CreateBox("deathPart",{
          width:sp.size[0],height:sp.size[1],depth:sp.size[2]
        },scene);
        radius=Math.max(...sp.size)*.42;
      } else {
        m=BABYLON.MeshBuilder.CreateCapsule("deathPart",{
          radius:sp.r,height:sp.h,tessellation:14
        },scene);
        radius=Math.max(sp.r*1.2,sp.h*.28);
      }

      m.material=MAT.npc;
      m.position=origin.add(new BABYLON.Vector3(...sp.off));
      m.scaling.set(...sp.scale);

      // Most of the velocity comes from the actual bat direction;
      // only a small separation impulse makes the body come apart.
      const scatter=new BABYLON.Vector3(
        (Math.random()-.5)*1.15,
        .35+Math.random()*1.10,
        (Math.random()-.5)*1.15
      );

      const vel=launchDir.scale(force).add(scatter);

      deathParts.push({
        mesh:m,
        vel,
        radius,
        life:4.2,
        spin:new BABYLON.Vector3(
          (Math.random()-.5)*7,
          (Math.random()-.5)*7,
          (Math.random()-.5)*7
        )
      });
    }
  }

  function coolDeathBurst(origin) {
    const sparkMat=mkMat("deathSpark"+Math.random(),"#ffd166");
    for(let i=0;i<16;i++){
      const s=BABYLON.MeshBuilder.CreateSphere("deathSpark",{
        diameter:.035+Math.random()*.025,segments:6
      },scene);
      s.position=origin.add(new BABYLON.Vector3(
        (Math.random()-.5)*.25,
        .9+Math.random()*.65,
        (Math.random()-.5)*.25
      ));
      s.material=sparkMat;

      const v=new BABYLON.Vector3(
        (Math.random()-.5)*4.2,
        1.5+Math.random()*3.5,
        (Math.random()-.5)*4.2
      );
      let life=.55+Math.random()*.30;

      const obs=scene.onBeforeRenderObservable.add(()=>{
        const dt=Math.min(.033,engine.getDeltaTime()/1000);
        life-=dt;
        v.y-=5.5*dt;
        s.position.addInPlace(v.scale(dt));
        s.scaling.scaleInPlace(.965);
        if(life<=0){
          scene.onBeforeRenderObservable.remove(obs);
          s.dispose();
        }
      });
    }
  }

  function finishNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead) return;

    speakNpc("death",true);

    let dir=swingVel.clone();
    if(dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    npc.dead=true;
    npc.hpValue=0;
    npc.hp.plane.setEnabled(false);
    npc.speech.plane.setEnabled(false);
    npc.ragdoll.dead=true;
    npc.respawnTimer=4.8;

    // Full-body launch, but the joints stay connected like a real ragdoll.
    const force=Math.min(18,7.0+speed*.80);
    const impulse=dir.scale(force).add(new BABYLON.Vector3(0,2.3,0));

    applyNpcRagdollImpulse(hitPos,impulse,2.5);

    // A little whole-body rotational asymmetry makes the fall look much
    // more natural without randomly exploding the body.
    for(const p of npc.ragdoll.list){
      const side=(p.pos.x>=0?1:-1);
      p.prev.x-=side*(Math.random()*.018);
      p.prev.z-=(Math.random()-.5)*.024;
    }

    coolDeathBurst(npcLocalToWorld(npc.ragdoll.points.chest.pos));
    pulse(hands.right,1,145);
    simpleHitSound(true);
  }
  function swingDamage(speed) {
    // Continuous detailed curve with many possible damage values.
    // Player damage is deliberately lower in v0.9 because the NPC is stronger.
    if (speed<.45) return 0;

    const raw = 0.8 + 1.18*Math.pow(speed,1.48);
    return Math.round(Math.max(1,Math.min(42,raw)));
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

    const force=Math.min(6.7,.55 + speed*.40);
    npc.velocity.addInPlace(dir.scale(force*.62));
    npc.velocity.y+=Math.max(0,dir.y)*.85;

    // The exact body area you hit now bends/wobbles physically.
    applyNpcRagdollImpulse(
      hitPos,
      dir.scale(.9 + speed*.34),
      .95
    );

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

            let speed=1.30;
            if (npc.emotion==="angry") speed=1.72;
            if (npc.emotion==="scared") speed=1.18;

            moveNpc(dir.scale(speed*dt));

            if (npc.speechCooldown<=0 && Math.random()<.014) {
              speakNpc(
                npc.emotion==="angry" ? "angry" :
                npc.emotion==="scared" ? "scared" : "chase"
              );
            }
          }

          // Start a real weapon swing, but distance alone does NOT deal damage.
          if (d<=2.05 && npc.stun<=0 && npc.attackAnim<=0 && npc.attackCooldown<=0) {
            npc.attackCooldown=.58;
            npc.attackAnim=npc.attackDuration;
            npc.attackHasHit=false;
            npc.attackBlocked=false;
            npc.weaponPrevTip=npc.weaponTip.getAbsolutePosition().clone();
            speakNpc("attack",true);
          }

          // Animate a weapon swing that continuously aims at the player's
          // CURRENT position, not just straight forward.
          if (npc.attackAnim>0) {
            const progress=1-(npc.attackAnim/npc.attackDuration);
            npc.attackAnim=Math.max(0,npc.attackAnim-dt);

            // Turn toward the player during the entire swing.
            const liveTarget=xrCamera.globalPosition.subtract(npc.root.position);
            liveTarget.y=0;

            if(liveTarget.lengthSquared()>.001){
              liveTarget.normalize();
              const desiredYaw=Math.atan2(liveTarget.x,liveTarget.z);

              let deltaYaw=desiredYaw-npc.root.rotation.y;
              deltaYaw=Math.atan2(Math.sin(deltaYaw),Math.cos(deltaYaw));
              npc.root.rotation.y+=deltaYaw*Math.min(1,dt*14);
            }

            // Aim weapon height toward current chest/head height.
            const targetWorld=xrCamera.globalPosition.add(
              new BABYLON.Vector3(0,-.28,0)
            );
            const weaponWorld=npc.weaponRoot.getAbsolutePosition();
            const aim=targetWorld.subtract(weaponWorld);

            const horizontal=Math.max(.001,Math.hypot(aim.x,aim.z));
            const pitchToPlayer=Math.atan2(aim.y,horizontal);

            // Windup -> fast strike -> followthrough, but centered on the
            // live pitch toward the player's body.
            let swingOffset;
            if(progress<.25){
              swingOffset=BABYLON.Scalar.Lerp(-1.18,-1.70,progress/.25);
            } else {
              swingOffset=BABYLON.Scalar.Lerp(-1.70,.78,(progress-.25)/.75);
            }

            npc.weaponRoot.rotation.x=pitchToPlayer+swingOffset;

            // Side angle bends the swing toward player's horizontal location.
            const localSide=BABYLON.Scalar.Clamp(
              liveTarget.x*Math.cos(npc.root.rotation.y) -
              liveTarget.z*Math.sin(npc.root.rotation.y),
              -1,1
            );
            npc.weaponRoot.rotation.y=localSide*.38;

            const tip=npc.weaponTip.getAbsolutePosition().clone();
            const prev=npc.weaponPrevTip||tip;
            npc.weaponPrevTip=tip.clone();

            // Block with player bat.
            if (!npc.attackBlocked && batRoot.isEnabled()) {
              const bb=batBase(),bt=batTip();
              const blockDist=Math.min(
                pointSegmentDistance(tip,bb,bt),
                pointSegmentDistance(prev,bb,bt)
              );

              if(blockDist<.22 && progress>.25 && progress<.94){
                npc.attackBlocked=true;
                npc.attackAnim=0;
                npc.stun=.50;

                let push=npc.root.position.subtract(xrCamera.globalPosition);
                push.y=0;
                if(push.lengthSquared()<.001) push.set(0,0,1);
                push.normalize();

                npc.velocity.addInPlace(push.scale(1.25));
                pulse(hands.right,.95,110);
                simpleHitSound(true);
                speakNpc("angry",true);
              }
            }

            // Real swept hitbox against head/chest/hips.
            if (!npc.attackBlocked && !npc.attackHasHit && progress>.32) {
              const hit=playerHitSpheres().some(s=>
                segmentSphereHit(prev,tip,s.center,s.radius+.085)
              );

              if(hit){
                npc.attackHasHit=true;
                hurtPlayer(npc.weaponCfg.damage,npc.root.position);

                let away=xrCamera.globalPosition.subtract(npc.root.position);
                away.y=0;
                if(away.lengthSquared()<.001) away.set(0,0,-1);
                away.normalize();

                bodyVelocity.addInPlace(
                  away.scale(npc.weaponCfg.knockback*.62)
                    .add(new BABYLON.Vector3(0,.38,0))
                );
              }
            }

          } else {
            npc.weaponRoot.rotation.x=.10;
            npc.weaponRoot.rotation.y=0;
          }

          npc.walkingNow=walking;
          if (walking) npc.walkPhase+=dt*8.5;

          // The active ragdoll produces walking/arm motion physically.
          updateNpcRagdoll(dt,true);
        } else {
          npc.walkingNow=false;
          updateNpcRagdoll(dt,true);
        }
      } else {
        npc.respawnTimer-=dt;
        npc.walkingNow=false;

        // Completely limp physics: no standing springs, only joints,
        // inertia, gravity and collisions.
        updateNpcRagdoll(dt,false);

        // Weapon stays attached to the limp right hand.
        npc.weaponRoot.position.copyFrom(npc.ragdoll.points.rHand.pos);

        if (npc.respawnTimer<=0) {
          npc.root.dispose();
          createNpc();
          npc.root.position=new BABYLON.Vector3(
            (Math.random()-.5)*2.6,
            0,
            1.7+Math.random()*1.2
          );
        }

      }
    }

    // Connected active-ragdoll death physics handled above.

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