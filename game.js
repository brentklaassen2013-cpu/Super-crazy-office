(()=>{
"use strict";

const BUILD="MOVEMENT ALPHA 0.3";
const canvas=document.getElementById("renderCanvas");
const statusEl=document.getElementById("status");
const startBtn=document.getElementById("startBtn");

const engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});
engine.setHardwareScalingLevel(1.35);
const scene=new BABYLON.Scene(engine);
scene.clearColor=new BABYLON.Color4(.025,.04,.065,1);
scene.skipPointerMovePicking=true;

const light=new BABYLON.HemisphericLight("light",new BABYLON.Vector3(0,1,0),scene);
light.intensity=.95;

function material(name,hex){
  const m=new BABYLON.StandardMaterial(name,scene);
  m.diffuseColor=BABYLON.Color3.FromHexString(hex);
  m.specularColor=new BABYLON.Color3(.08,.08,.08);
  return m;
}
const floorMat=material("floorMat","#253548");
const wallMat=material("wallMat","#3a506b");
const handMat=material("handMat","#d09a72");

const HALF=5.5, WALL_H=4.0, WALL_T=.25, FLOOR_Y=0;
const floor=BABYLON.MeshBuilder.CreateBox("ground",{width:11,height:.2,depth:11},scene);
floor.position.y=-.1; floor.material=floorMat;

function wall(name,x,y,z,w,h,d){
  const m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
  m.position.set(x,y,z); m.material=wallMat; return m;
}
wall("north",0,WALL_H/2,-HALF,11,WALL_H,WALL_T);
wall("south",0,WALL_H/2, HALF,11,WALL_H,WALL_T);
wall("west",-HALF,WALL_H/2,0,WALL_T,WALL_H,11);
wall("east", HALF,WALL_H/2,0,WALL_T,WALL_H,11);

// A few ramps/blocks to test climbing and pushing.
const blockMat=material("blockMat","#516d8c");
const block=BABYLON.MeshBuilder.CreateBox("testBlock",{width:2.0,height:1.0,depth:1.2},scene);
block.position.set(0,.5,-2.2); block.material=blockMat;
const low=BABYLON.MeshBuilder.CreateBox("lowBlock",{width:1.6,height:.45,depth:1.6},scene);
low.position.set(2.7,.225,1.7); low.material=blockMat;

// Build plaque
const plaque=BABYLON.MeshBuilder.CreatePlane("buildPlaque",{width:3.1,height:.72},scene);
plaque.position.set(0,2.5,-HALF+.14);
const adt=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plaque,1024,256);
const bg=new BABYLON.GUI.Rectangle(); bg.background="#07111f"; bg.color="#22d3ee"; bg.thickness=6; adt.addControl(bg);
const tx=new BABYLON.GUI.TextBlock(); tx.text=BUILD; tx.color="#7eeeff"; tx.fontSize=84; tx.fontWeight="900"; bg.addControl(tx);

let xr=null, cam=null, inXR=false;

// Easier Gorilla-style tuning:
const HAND_RADIUS=.09;
const ARM_LENGTH=.92;          // generous reach
const PUSH_MULT=1.35;          // easier horizontal movement
const UP_MULT=1.42;            // easier vertical movement
const RELEASE_BOOST=.32;       // extra momentum on release
const MAX_RELEASE_SPEED=5.2;
const GRAVITY=-9.81;
const MAX_FALL=-7.0;
const BODY_FLOOR=.30;
const TORSO_RADIUS=.20;
const TORSO_Y_FROM_HEAD=-.415; // 7.5 cm lower

let velocity=new BABYLON.Vector3(0,0,0);
let grounded=false;
let landingFrames=0;
const velocityHistory=[];
const HISTORY=6;

const hands={
  left:{controller:null,node:null,mesh:null,contact:null,lastController:null,wasTouching:false},
  right:{controller:null,node:null,mesh:null,contact:null,lastController:null,wasTouching:false}
};

function makeHand(side){
  const m=BABYLON.MeshBuilder.CreateSphere("hand_"+side,{diameter:.17,segments:12},scene);
  m.scaling.set(1.15,.72,1.12);
  m.material=handMat; m.isPickable=false; m.setEnabled(false);
  return m;
}
hands.left.mesh=makeHand("left"); hands.right.mesh=makeHand("right");

function worldPos(h){
  if(!h?.node)return null;
  const p=h.node.getAbsolutePosition?.()||h.node.position;
  return p?.clone?.()||null;
}

function headPos(){
  const p=cam?.globalPosition||cam?.position;
  return p?.clone?.()||BABYLON.Vector3.Zero();
}

function clampArm(p){
  const head=headPos();
  // shoulder-ish origin slightly below head
  const shoulder=head.add(new BABYLON.Vector3(0,-.22,0));
  const delta=p.subtract(shoulder);
  const len=delta.length();
  if(len<=ARM_LENGTH)return p.clone();
  return shoulder.add(delta.scale(ARM_LENGTH/Math.max(len,.0001)));
}

function contactAt(p){
  if(!p)return null;

  // floor
  if(p.y<=FLOOR_Y+HAND_RADIUS+.035)
    return {point:new BABYLON.Vector3(p.x,FLOOR_Y+HAND_RADIUS,p.z),normal:new BABYLON.Vector3(0,1,0)};

  // room walls
  const inner=HALF-WALL_T*.5-HAND_RADIUS;
  if(p.x<-inner)return {point:new BABYLON.Vector3(-inner,p.y,p.z),normal:new BABYLON.Vector3(1,0,0)};
  if(p.x> inner)return {point:new BABYLON.Vector3( inner,p.y,p.z),normal:new BABYLON.Vector3(-1,0,0)};
  if(p.z<-inner)return {point:new BABYLON.Vector3(p.x,p.y,-inner),normal:new BABYLON.Vector3(0,0,1)};
  if(p.z> inner)return {point:new BABYLON.Vector3(p.x,p.y, inner),normal:new BABYLON.Vector3(0,0,-1)};

  // simple block AABB contact approximation
  for(const b of [block,low]){
    const bi=b.getBoundingInfo().boundingBox;
    const mn=bi.minimumWorld, mx=bi.maximumWorld;
    const q=new BABYLON.Vector3(
      BABYLON.Scalar.Clamp(p.x,mn.x,mx.x),
      BABYLON.Scalar.Clamp(p.y,mn.y,mx.y),
      BABYLON.Scalar.Clamp(p.z,mn.z,mx.z)
    );
    const d=p.subtract(q);
    const dist=d.length();
    if(dist<=HAND_RADIUS){
      let n;
      if(dist>.001)n=d.scale(1/dist);
      else n=new BABYLON.Vector3(0,1,0);
      return {point:q.add(n.scale(HAND_RADIUS)),normal:n};
    }
  }
  return null;
}

function averageRecentVelocity(){
  if(!velocityHistory.length)return BABYLON.Vector3.Zero();
  const v=BABYLON.Vector3.Zero();
  for(const x of velocityHistory)v.addInPlace(x);
  return v.scale(1/velocityHistory.length);
}

function updateHand(h,dt){
  if(!h.node)return BABYLON.Vector3.Zero();

  const raw=worldPos(h);
  if(!raw)return BABYLON.Vector3.Zero();

  const desired=clampArm(raw);
  const hit=contactAt(desired);

  if(!h.lastController)h.lastController=desired.clone();

  let correction=BABYLON.Vector3.Zero();

  if(hit){
    if(!h.contact){
      // New touch: store only the surface point.
      h.contact=hit.point.clone();
    }

    // Gorilla-style constraint:
    // controller wants to move through surface, hand stays at contact,
    // so body gets pushed by the difference.
    const handTarget=h.contact;
    correction=handTarget.subtract(desired);

    // Easier movement: amplify correction a little.
    correction.x*=PUSH_MULT;
    correction.z*=PUSH_MULT;
    if(correction.y>0)correction.y*=UP_MULT;
    else correction.y*=PUSH_MULT;

    // tiny landing suppression only on first couple frames after body lands
    if(landingFrames>0 && correction.y>0)correction.y=0;

    // constrained visual hand = contact point
    h.mesh.position.copyFrom(handTarget);
    h.wasTouching=true;
  }else{
    if(h.wasTouching){
      // Release momentum from recent body motion.
      const avg=averageRecentVelocity();
      const sp=Math.min(MAX_RELEASE_SPEED,avg.length());
      if(sp>.05){
        velocity.addInPlace(avg.normalize().scale(sp*RELEASE_BOOST));
      }
    }

    h.contact=null;
    h.wasTouching=false;
    h.mesh.position.copyFrom(desired);
  }

  h.mesh.setEnabled(true);
  h.lastController.copyFrom(desired);

  const maxStep=.13;
  if(correction.length()>maxStep)correction.normalize().scaleInPlace(maxStep);
  return correction;
}

function resolveBody(){
  if(!cam)return;

  const head=headPos();
  const torso=head.add(new BABYLON.Vector3(0,TORSO_Y_FROM_HEAD,0));

  // room horizontal bounds
  const lim=HALF-WALL_T*.5-TORSO_RADIUS;
  if(torso.x<-lim)cam.position.x+=(-lim-torso.x);
  if(torso.x> lim)cam.position.x-=(torso.x-lim);
  if(torso.z<-lim)cam.position.z+=(-lim-torso.z);
  if(torso.z> lim)cam.position.z-=(torso.z-lim);

  // floor
  if(cam.position.y<BODY_FLOOR){
    cam.position.y=BODY_FLOOR;
    if(velocity.y<0)velocity.y=0;
  }
}

function updateMovement(dt){
  if(!inXR||!cam)return;

  if(landingFrames>0)landingFrames--;

  const before=cam.position.clone();

  const l=updateHand(hands.left,dt);
  const r=updateHand(hands.right,dt);

  let push=BABYLON.Vector3.Zero();
  const la=l.lengthSquared()>.000001;
  const ra=r.lengthSquared()>.000001;

  if(la&&ra)push=l.add(r).scale(.58); // slightly stronger than exact average
  else if(la)push=l;
  else if(ra)push=r;

  if(push.lengthSquared()>.000001){
    cam.position.addInPlace(push);

    // turn hand push into momentum, but not crazy launch.
    const instant=push.scale(1/Math.max(dt,.008));
    velocity.x=BABYLON.Scalar.Lerp(velocity.x,instant.x,.11);
    velocity.z=BABYLON.Scalar.Lerp(velocity.z,instant.z,.11);
    if(push.y>0){
      velocity.y=Math.max(velocity.y,Math.min(4.4,instant.y*.18));
    }
  }

  // gravity / free movement
  velocity.y+=GRAVITY*dt;
  velocity.y=Math.max(MAX_FALL,velocity.y);

  velocity.x*=Math.pow(.97,dt*60);
  velocity.z*=Math.pow(.97,dt*60);

  cam.position.addInPlace(velocity.scale(dt));

  const wasGrounded=grounded;
  grounded=cam.position.y<=BODY_FLOOR+.02;
  if(grounded&&!wasGrounded){
    landingFrames=2;
    if(velocity.y<0)velocity.y=0;
  }

  resolveBody();

  const moved=cam.position.subtract(before).scale(1/Math.max(dt,.008));
  velocityHistory.push(moved);
  if(velocityHistory.length>HISTORY)velocityHistory.shift();
}

function reset(){
  velocity.set(0,0,0);
  velocityHistory.length=0;
  grounded=false;
  landingFrames=0;
  for(const h of Object.values(hands)){
    h.contact=null; h.lastController=null; h.wasTouching=false;
  }
}

async function setupXR(){
  try{
    if(!navigator.xr)throw new Error("WebXR niet beschikbaar");
    const ok=await navigator.xr.isSessionSupported("immersive-vr");
    if(!ok)throw new Error("Immersive VR niet beschikbaar");

    xr=await scene.createDefaultXRExperienceAsync({
      floorMeshes:[floor],
      disableTeleportation:true,
      disablePointerSelection:true,
      uiOptions:{sessionMode:"immersive-vr",referenceSpaceType:"local-floor"}
    });
    cam=xr.baseExperience.camera;

    xr.input.onControllerAddedObservable.add(c=>{
      const side=c.inputSource.handedness;
      if(side!=="left"&&side!=="right")return;
      const h=hands[side];
      h.controller=c;
      const bind=()=>{
        h.node=c.grip||c.pointer;
        h.contact=null;
        h.lastController=null;
        h.mesh.setEnabled(!!h.node);
      };
      c.onMotionControllerInitObservable.add(bind);
      bind();
    });

    xr.input.onControllerRemovedObservable.add(c=>{
      const side=c.inputSource.handedness;
      if(!hands[side])return;
      const h=hands[side];
      h.controller=null; h.node=null; h.contact=null; h.lastController=null; h.wasTouching=false;
      h.mesh.setEnabled(false);
    });

    xr.baseExperience.onStateChangedObservable.add(state=>{
      inXR=state===BABYLON.WebXRState.IN_XR;
      if(inXR){
        document.getElementById("ui").style.display="none";
        reset();
        cam.position.x=0; cam.position.z=1.5;
        if(cam.position.y<.9)cam.position.y=1.55;
      }else{
        document.getElementById("ui").style.display="flex";
      }
    });

    statusEl.textContent="XR KLAAR";
    startBtn.disabled=false;
    startBtn.textContent="START VR";
  }catch(e){
    console.error(e);
    statusEl.textContent="XR FOUT: "+(e?.message||e);
    startBtn.textContent="KAN NIET STARTEN";
  }
}

startBtn.addEventListener("click",async()=>{
  if(!xr?.baseExperience)return;
  try{
    startBtn.disabled=true;
    startBtn.textContent="STARTEN...";
    await xr.baseExperience.enterXRAsync("immersive-vr","local-floor",xr.renderTarget);
  }catch(e){
    console.error(e);
    statusEl.textContent="START FOUT: "+(e?.message||e);
    startBtn.disabled=false;
    startBtn.textContent="START VR";
  }
});

setupXR();

scene.onBeforeRenderObservable.add(()=>{
  const dt=Math.min(.025,engine.getDeltaTime()/1000);
  updateMovement(dt);
});

engine.runRenderLoop(()=>scene.render());
window.addEventListener("resize",()=>engine.resize());
})();