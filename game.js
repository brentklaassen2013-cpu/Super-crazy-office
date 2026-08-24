(()=>{
  "use strict";

  const BUILD="MOVEMENT ALPHA 0.1";
  const canvas=document.getElementById("renderCanvas");
  const engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});
  engine.setHardwareScalingLevel(1.35);

  const scene=new BABYLON.Scene(engine);
  scene.clearColor=new BABYLON.Color4(.025,.035,.055,1);
  scene.skipPointerMovePicking=true;

  const hemi=new BABYLON.HemisphericLight("hemi",new BABYLON.Vector3(0,1,0),scene);
  hemi.intensity=.95;
  const sun=new BABYLON.DirectionalLight("sun",new BABYLON.Vector3(-.4,-1,.25),scene);
  sun.position.set(4,8,-3); sun.intensity=.55;

  const mkMat=(name,color)=>{
    const m=new BABYLON.StandardMaterial(name,scene);
    m.diffuseColor=BABYLON.Color3.FromHexString(color);
    m.specularColor=new BABYLON.Color3(.08,.08,.08);
    return m;
  };

  const floorMat=mkMat("floorMat","#202b3a");
  const wallMat=mkMat("wallMat","#34465d");
  const accentMat=mkMat("accentMat","#22d3ee");
  accentMat.emissiveColor=BABYLON.Color3.FromHexString("#22d3ee").scale(.28);
  const handMat=mkMat("handMat","#c98b5f");

  const ROOM_HALF=5.5, WALL_H=4.0, WALL_T=.28, FLOOR_Y=0;

  const ground=BABYLON.MeshBuilder.CreateBox("ground",{width:11,depth:11,height:.22},scene);
  ground.position.y=-.11; ground.material=floorMat;

  const wallN=BABYLON.MeshBuilder.CreateBox("wallN",{width:11,height:WALL_H,depth:WALL_T},scene);
  wallN.position.set(0,WALL_H/2,-ROOM_HALF); wallN.material=wallMat;
  const wallS=BABYLON.MeshBuilder.CreateBox("wallS",{width:11,height:WALL_H,depth:WALL_T},scene);
  wallS.position.set(0,WALL_H/2, ROOM_HALF); wallS.material=wallMat;
  const wallW=BABYLON.MeshBuilder.CreateBox("wallW",{width:WALL_T,height:WALL_H,depth:11},scene);
  wallW.position.set(-ROOM_HALF,WALL_H/2,0); wallW.material=wallMat;
  const wallE=BABYLON.MeshBuilder.CreateBox("wallE",{width:WALL_T,height:WALL_H,depth:11},scene);
  wallE.position.set( ROOM_HALF,WALL_H/2,0); wallE.material=wallMat;

  const plaque=BABYLON.MeshBuilder.CreatePlane("plaque",{width:3.0,height:.75},scene);
  plaque.position.set(0,2.5,-ROOM_HALF+.16);
  const pgui=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plaque,1024,256);
  const pbg=new BABYLON.GUI.Rectangle();
  pbg.background="#07111F"; pbg.color="#22d3ee"; pbg.thickness=6; pgui.addControl(pbg);
  const ptxt=new BABYLON.GUI.TextBlock();
  ptxt.text=BUILD; ptxt.color="#7eeeff"; ptxt.fontSize=82; ptxt.fontWeight="900"; pbg.addControl(ptxt);

  let xr=null, xrCamera=null, inXR=false;

  const hands={
    left:{controller:null,node:null,mesh:null,lastLocal:null,touching:false},
    right:{controller:null,node:null,mesh:null,lastLocal:null,touching:false}
  };

  function makeHand(side){
    const m=BABYLON.MeshBuilder.CreateSphere("hand_"+side,{diameter:.16,segments:12},scene);
    m.scaling.set(1.1,.75,1.15); m.material=handMat; m.isPickable=false; m.setEnabled(false); return m;
  }
  hands.left.mesh=makeHand("left");
  hands.right.mesh=makeHand("right");

  const HAND_R=.085;
  const GRAVITY=-9.81;
  const MAX_FALL=-7.5;
  const MAX_UP=4.8;
  const PUSH_GAIN=2.15;
  const WALL_PUSH_GAIN=1.65;
  const MAX_RIG_STEP=.145;
  const GROUND_EPS=.03;

  let velocity=new BABYLON.Vector3(0,0,0);
  let grounded=false;
  let landingLock=0;

  function nodeLocalPos(h){
    if(!h?.node)return null;
    return h.node.position?.clone?.()||null;
  }
  function nodeWorldPos(h){
    if(!h?.node)return null;
    return h.node.getAbsolutePosition?.()?.clone?.()||h.node.position?.clone?.()||null;
  }

  function handContact(world){
    if(!world)return null;
    if(world.y<=FLOOR_Y+HAND_R+GROUND_EPS){
      return {normal:new BABYLON.Vector3(0,1,0),point:new BABYLON.Vector3(world.x,FLOOR_Y,world.z),kind:"floor"};
    }
    if(world.x<=-ROOM_HALF+HAND_R+WALL_T*.5){
      return {normal:new BABYLON.Vector3(1,0,0),point:new BABYLON.Vector3(-ROOM_HALF+WALL_T*.5,world.y,world.z),kind:"wall"};
    }
    if(world.x>=ROOM_HALF-HAND_R-WALL_T*.5){
      return {normal:new BABYLON.Vector3(-1,0,0),point:new BABYLON.Vector3(ROOM_HALF-WALL_T*.5,world.y,world.z),kind:"wall"};
    }
    if(world.z<=-ROOM_HALF+HAND_R+WALL_T*.5){
      return {normal:new BABYLON.Vector3(0,0,1),point:new BABYLON.Vector3(world.x,world.y,-ROOM_HALF+WALL_T*.5),kind:"wall"};
    }
    if(world.z>=ROOM_HALF-HAND_R-WALL_T*.5){
      return {normal:new BABYLON.Vector3(0,0,-1),point:new BABYLON.Vector3(world.x,world.y,ROOM_HALF-WALL_T*.5),kind:"wall"};
    }
    return null;
  }

  function clampRigInsideRoom(){
    if(!xrCamera)return;
    const margin=.24;
    xrCamera.position.x=BABYLON.Scalar.Clamp(xrCamera.position.x,-ROOM_HALF+margin,ROOM_HALF-margin);
    xrCamera.position.z=BABYLON.Scalar.Clamp(xrCamera.position.z,-ROOM_HALF+margin,ROOM_HALF-margin);
    if(xrCamera.position.y<.30){
      xrCamera.position.y=.30;
      if(velocity.y<0)velocity.y=0;
    }
  }

  function resetHandState(){
    for(const side of ["left","right"]){
      hands[side].lastLocal=null;
      hands[side].touching=false;
    }
  }

  function updateVisibleHands(){
    for(const side of ["left","right"]){
      const h=hands[side];
      if(!h.node)continue;
      const p=nodeWorldPos(h);
      if(!p)continue;
      h.mesh.position.copyFrom(p);
      h.mesh.setEnabled(true);
    }
  }

  function computeHandPush(h,dt){
    if(!h?.node)return BABYLON.Vector3.Zero();

    const local=nodeLocalPos(h);
    const world=nodeWorldPos(h);
    if(!local||!world)return BABYLON.Vector3.Zero();

    const contact=handContact(world);

    if(!h.lastLocal){
      h.lastLocal=local.clone();
      h.touching=!!contact;
      return BABYLON.Vector3.Zero();
    }

    const delta=local.subtract(h.lastLocal);
    h.lastLocal.copyFrom(local);

    if(!contact){
      h.touching=false;
      return BABYLON.Vector3.Zero();
    }
    h.touching=true;

    let rigDelta=delta.scale(-1);

    if(contact.kind==="floor"){
      rigDelta.scaleInPlace(PUSH_GAIN);
      if(landingLock>0 && rigDelta.y>0)rigDelta.y=0;
    }else{
      rigDelta.scaleInPlace(WALL_PUSH_GAIN);
    }

    if(rigDelta.length()>MAX_RIG_STEP){
      rigDelta.normalize().scaleInPlace(MAX_RIG_STEP);
    }
    return rigDelta;
  }

  function updateMovement(dt){
    if(!inXR||!xrCamera)return;

    landingLock=Math.max(0,landingLock-dt);

    const wasGrounded=grounded;
    grounded=xrCamera.position.y<=.34;
    if(grounded && !wasGrounded && velocity.y<-.8){
      landingLock=.055;
      velocity.y=0;
    }

    const l=computeHandPush(hands.left,dt);
    const r=computeHandPush(hands.right,dt);

    let rig=new BABYLON.Vector3();
    const lActive=l.lengthSquared()>.0000005;
    const rActive=r.lengthSquared()>.0000005;
    if(lActive&&rActive)rig=l.add(r).scale(.5);
    else if(lActive)rig=l;
    else if(rActive)rig=r;

    if(rig.lengthSquared()>.0000005){
      xrCamera.position.addInPlace(rig);
      const imp=rig.scale(1/Math.max(dt,.008));
      velocity.x=BABYLON.Scalar.Lerp(velocity.x,imp.x,.16);
      velocity.z=BABYLON.Scalar.Lerp(velocity.z,imp.z,.16);
      if(rig.y>0 && landingLock<=0){
        velocity.y=Math.max(velocity.y,Math.min(MAX_UP,imp.y*.25));
      }
    }

    velocity.y+=GRAVITY*dt;
    velocity.y=Math.max(velocity.y,MAX_FALL);
    velocity.x*=Math.pow(.965,dt*60);
    velocity.z*=Math.pow(.965,dt*60);

    xrCamera.position.addInPlace(velocity.scale(dt));

    if(xrCamera.position.y<.30){
      xrCamera.position.y=.30;
      if(velocity.y<0)velocity.y=0;
    }

    clampRigInsideRoom();
  }

  async function setupXR(){
    try{
      xr=await scene.createDefaultXRExperienceAsync({
        floorMeshes:[ground],
        disableTeleportation:true,
        disablePointerSelection:true,
        uiOptions:{sessionMode:"immersive-vr",referenceSpaceType:"local-floor"}
      });
      xrCamera=xr.baseExperience.camera;

      xr.input.onControllerAddedObservable.add(c=>{
        const side=c.inputSource.handedness;
        if(side!=="left"&&side!=="right")return;
        const h=hands[side];
        h.controller=c;
        const bind=()=>{
          h.node=c.grip||c.pointer;
          h.lastLocal=null;
          h.mesh.setEnabled(!!h.node);
        };
        c.onMotionControllerInitObservable.add(bind);
        bind();
      });

      xr.input.onControllerRemovedObservable.add(c=>{
        const side=c.inputSource.handedness;
        if(!hands[side])return;
        const h=hands[side];
        h.controller=null; h.node=null; h.lastLocal=null; h.touching=false; h.mesh.setEnabled(false);
      });

      xr.baseExperience.onStateChangedObservable.add(state=>{
        inXR=state===BABYLON.WebXRState.IN_XR;
        if(inXR){
          document.getElementById("ui").style.display="none";
          velocity.set(0,0,0);
          resetHandState();
          xrCamera.position.x=0;
          xrCamera.position.z=0;
          if(xrCamera.position.y<.9)xrCamera.position.y=1.55;
        }else{
          document.getElementById("ui").style.display="flex";
        }
      });
    }catch(e){
      console.error(e);
      document.getElementById("status").textContent="XR fout: "+(e?.message||e);
    }
  }
  setupXR();

  document.getElementById("startBtn").addEventListener("click",async()=>{
    try{
      await xr?.baseExperience?.enterXRAsync("immersive-vr","local-floor",xr.renderTarget);
    }catch(e){ console.error(e); }
  });

  scene.onBeforeRenderObservable.add(()=>{
    const dt=Math.min(.025,engine.getDeltaTime()/1000);
    updateMovement(dt);
    updateVisibleHands();
  });

  engine.runRenderLoop(()=>scene.render());
  window.addEventListener("resize",()=>engine.resize());
})();