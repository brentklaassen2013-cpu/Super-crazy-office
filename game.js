(() => {
  const BUILD_VERSION="0.36.0";
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true, { stencil:true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(.025,.055,.095,1);
  scene.collisionsEnabled = true;
  scene.imageProcessingConfiguration.contrast=1.12;
  scene.imageProcessingConfiguration.exposure=.92;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;

  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = .9;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-.42,-1,.18), scene);
  sun.position = new BABYLON.Vector3(4.5,7.5,-5.5);
  sun.intensity = .70;

  // Soft low-cost shadows: mainly the NPC and movable props cast them.
  const shadowGen=new BABYLON.ShadowGenerator(512,sun);
  shadowGen.useBlurExponentialShadowMap=true;
  shadowGen.blurKernel=8;
  shadowGen.bias=.0025;

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
    npcHit: mkMat("npcHit","#d71920"),
    hudGreen: mkMat("hudGreen","#22c55e")
  };
  MAT.npcHit.emissiveColor=new BABYLON.Color3(.18,.006,.008);
  MAT.npcHit.specularColor=new BABYLON.Color3(.10,.01,.01);

  const potatoMat=mkMat("potatoSkin","#a97848");
  potatoMat.specularColor=new BABYLON.Color3(.035,.025,.018);
  potatoMat.specularPower=8;
  potatoMat.emissiveColor=potatoMat.diffuseColor.scale(.018);

  const potatoDarkMat=mkMat("potatoDark","#6d472c");
  potatoDarkMat.specularColor=new BABYLON.Color3(.02,.015,.01);

  const potatoLightMat=mkMat("potatoLight","#c3915b");
  potatoLightMat.specularColor=new BABYLON.Color3(.035,.025,.018);

  // ------------------------------------------------------------
  // Destructible OFFICE map
  // ------------------------------------------------------------
  const collisionSurfaces = [];
  const breakableWindows = [];
  const officeProps = [];
  const fxBodies = [];
  const bloodSplats = [];
  const sprinklerHeads=[];
  let sprinklersActive=false;
  let sprinklerTimer=0;

  const PERF={
    maxFx:220,
    maxBloodSplats:0,
    maxDeathParts:0,
    propSleepSpeed:.16,
    propSleepSeconds:.24
  };

  function trimFxBodies(){
    while(fxBodies.length>PERF.maxFx){
      const f=fxBodies.shift();
      f?.mesh?.dispose?.();
    }
  }

  const officeFloorMat=mkMat("officeFloor","#7c858f");
  const officeWallMat=mkMat("officeWall","#d8dde3");
  const deskMat=mkMat("deskWood","#76513b");
  const deskMetalMat=mkMat("deskMetal","#4b5563");
  const chairMat=mkMat("chair","#202938");
  const monitorMat=mkMat("monitor","#181c24");
  const screenMat=mkMat("screen","#183b55");
  screenMat.emissiveColor=new BABYLON.Color3(.06,.16,.24);
  const keyboardMat=mkMat("keyboard","#303640");
  const plantMat=mkMat("plant","#397449");
  const potMat=mkMat("pot","#8b5a3c");
  const bloodMat=mkMat("blood","#7a0710");
  bloodMat.specularColor=new BABYLON.Color3(.18,.02,.02);
  const bloodBrightMat=mkMat("bloodBright","#b30b18");
  const outsideMat=mkMat("outsideGround","#333943");
  const trimMat=mkMat("officeTrim","#eef1f4");
  const darkTrimMat=mkMat("darkTrim","#505963");
  const paperMat=mkMat("paper","#f1f1ed");
  const mugMat=mkMat("mug","#d7dde4");
  const blueMat=mkMat("officeBlue","#4779a8");
  const redMat=mkMat("officeRed","#b84242");
  const bookMatA=mkMat("bookA","#425c7d");
  const bookMatB=mkMat("bookB","#934e42");
  const bookMatC=mkMat("bookC","#668457");
  const boardMat=mkMat("whiteboard","#f5f7f7");
  const corkMat=mkMat("cork","#aa8057");

  // ------------------------------------------------------------
  // Lightweight procedural surface textures.
  // One tiny shared texture per material type keeps the Quest load low.
  // ------------------------------------------------------------
  function makeDetailTexture(name,kind,size=96){
    const tex=new BABYLON.DynamicTexture(name,{width:size,height:size},scene,false);
    const c=tex.getContext();

    c.fillStyle="#ffffff";
    c.fillRect(0,0,size,size);

    if(kind==="wood"){
      c.strokeStyle="rgba(85,48,26,.075)";
      c.lineWidth=1;
      for(let y=8;y<size;y+=16){
        c.beginPath();
        for(let x=0;x<=size;x+=8){
          const yy=y+Math.sin((x+y)*.12)*2.2;
          if(x===0)c.moveTo(x,yy);else c.lineTo(x,yy);
        }
        c.stroke();
      }
      for(let i=0;i<5;i++){
        c.fillStyle="rgba(70,40,24,.025)";
        c.fillRect(Math.random()*size,Math.random()*size,10+Math.random()*24,1);
      }
    }else if(kind==="fabric"){
      c.strokeStyle="rgba(40,40,40,.028)";
      c.lineWidth=1;
      for(let i=0;i<size;i+=12){
        c.beginPath();c.moveTo(i,0);c.lineTo(i,size);c.stroke();
        c.beginPath();c.moveTo(0,i);c.lineTo(size,i);c.stroke();
      }
    }else if(kind==="skin"){
      for(let i=0;i<18;i++){
        const a=.006+Math.random()*.010;
        c.fillStyle=`rgba(72,34,22,${a})`;
        const r=.30+Math.random()*.45;
        c.beginPath();
        c.arc(Math.random()*size,Math.random()*size,r,0,Math.PI*2);
        c.fill();
      }
    }else if(kind==="wall"){
      for(let i=0;i<28;i++){
        const v=210+Math.floor(Math.random()*30);
        c.fillStyle=`rgba(${v},${v},${v},.025)`;
        c.fillRect(Math.random()*size,Math.random()*size,1,1);
      }
    }else if(kind==="metal"){
      c.strokeStyle="rgba(60,70,78,.035)";
      for(let y=2;y<size;y+=10){
        c.beginPath();c.moveTo(0,y);c.lineTo(size,y);c.stroke();
      }
    }else if(kind==="floor"){
      c.strokeStyle="rgba(55,64,72,.055)";
      c.lineWidth=1;
      for(let i=0;i<=size;i+=24){
        c.beginPath();c.moveTo(i,0);c.lineTo(i,size);c.stroke();
        c.beginPath();c.moveTo(0,i);c.lineTo(size,i);c.stroke();
      }
      for(let i=0;i<10;i++){
        c.fillStyle="rgba(40,48,54,.012)";
        c.fillRect(Math.random()*size,Math.random()*size,2,2);
      }
    }else if(kind==="hair"){
      c.strokeStyle="rgba(25,14,10,.060)";
      for(let i=0;i<22;i++){
        const x=Math.random()*size;
        c.beginPath();
        c.moveTo(x,0);
        c.lineTo(x-4+Math.random()*8,size);
        c.stroke();
      }
    }

    tex.update(false);
    tex.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  function makeBumpTexture(name,kind,size=96){
    const tex=new BABYLON.DynamicTexture(name,{width:size,height:size},scene,false);
    const c=tex.getContext();
    c.fillStyle="#808080";
    c.fillRect(0,0,size,size);

    const dot=(x,y,r,v)=>{
      c.fillStyle=`rgb(${v},${v},${v})`;
      c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    };

    if(kind==="skin"){
      for(let i=0;i<28;i++) dot(Math.random()*size,Math.random()*size,.25+Math.random()*.30,122+Math.floor(Math.random()*12));
    }else if(kind==="fabric"){
      c.strokeStyle="rgba(105,105,105,.65)";c.lineWidth=1;
      for(let i=0;i<size;i+=12){
        c.beginPath();c.moveTo(i,0);c.lineTo(i,size);c.stroke();
        c.beginPath();c.moveTo(0,i);c.lineTo(size,i);c.stroke();
      }
    }else if(kind==="wood"){
      c.strokeStyle="rgba(105,105,105,.65)";c.lineWidth=1;
      for(let y=8;y<size;y+=18){
        c.beginPath();
        for(let x=0;x<=size;x+=5){
          const yy=y+Math.sin(x*.16+y)*1.8;
          if(x===0)c.moveTo(x,yy);else c.lineTo(x,yy);
        }
        c.stroke();
      }
    }else if(kind==="wall" || kind==="floor"){
      for(let i=0;i<18;i++){
        const v=124+Math.floor(Math.random()*8);
        c.fillStyle=`rgb(${v},${v},${v})`;
        c.fillRect(Math.random()*size,Math.random()*size,1,1);
      }
    }else if(kind==="metal"){
      c.strokeStyle="rgba(105,105,105,.55)";
      for(let y=0;y<size;y+=10){c.beginPath();c.moveTo(0,y);c.lineTo(size,y);c.stroke();}
    }
    tex.update(false);
    tex.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  const BUMP_TEX={
    skin:makeBumpTexture("bumpSkin","skin"),
    fabric:makeBumpTexture("bumpFabric","fabric"),
    wood:makeBumpTexture("bumpWood","wood"),
    wall:makeBumpTexture("bumpWall","wall"),
    floor:makeBumpTexture("bumpFloor","floor"),
    metal:makeBumpTexture("bumpMetal","metal")
  };
  Object.values(BUMP_TEX).forEach(t=>{t.uScale=1.35;t.vScale=1.35;});

  const DETAIL_TEX={
    wood:makeDetailTexture("texWood","wood"),
    fabric:makeDetailTexture("texFabric","fabric"),
    skin:makeDetailTexture("texSkin","skin"),
    wall:makeDetailTexture("texWall","wall"),
    metal:makeDetailTexture("texMetal","metal"),
    floor:makeDetailTexture("texFloor","floor"),
    hair:makeDetailTexture("texHair","hair")
  };

  DETAIL_TEX.wood.uScale=1.4;DETAIL_TEX.wood.vScale=1.4;
  DETAIL_TEX.fabric.uScale=1.8;DETAIL_TEX.fabric.vScale=1.8;
  DETAIL_TEX.skin.uScale=1.35;DETAIL_TEX.skin.vScale=1.35;
  DETAIL_TEX.wall.uScale=1.7;DETAIL_TEX.wall.vScale=1.7;
  DETAIL_TEX.metal.uScale=1.6;DETAIL_TEX.metal.vScale=1.6;
  DETAIL_TEX.floor.uScale=1.25;DETAIL_TEX.floor.vScale=1.25;
  DETAIL_TEX.hair.uScale=1.7;DETAIL_TEX.hair.vScale=1.7;

  // clean v0.23.3: officeFloorMat.diffuseTexture=DETAIL_TEX.floor;
  // clean v0.23.3: officeWallMat.diffuseTexture=DETAIL_TEX.wall;
  // v0.23.4 clean material: deskMat.diffuseTexture=DETAIL_TEX.wood;
  // v0.23.4 clean material: deskMetalMat.diffuseTexture=DETAIL_TEX.metal;
  // clean v0.23.3: chairMat.diffuseTexture=DETAIL_TEX.fabric;
  // v0.23.4 clean material: monitorMat.diffuseTexture=DETAIL_TEX.metal;
  // clean v0.23.3: keyboardMat.diffuseTexture=DETAIL_TEX.metal;
  // clean v0.23.3: trimMat.diffuseTexture=DETAIL_TEX.wall;
  // v0.23.4 clean material: darkTrimMat.diffuseTexture=DETAIL_TEX.metal;
  // v0.23.4 clean material: corkMat.diffuseTexture=DETAIL_TEX.wood;

  // v0.23.6 clean realism: no noisy floor bump
  // v0.23.6 clean realism: no noisy wall bump
  deskMat.bumpTexture=BUMP_TEX.wood;deskMat.bumpTexture.level=.06;
  deskMetalMat.bumpTexture=BUMP_TEX.metal;deskMetalMat.bumpTexture.level=.05;
  // v0.23.6 clean realism: no noisy chair bump
  monitorMat.bumpTexture=BUMP_TEX.metal;monitorMat.bumpTexture.level=.04;
  keyboardMat.bumpTexture=BUMP_TEX.metal;keyboardMat.bumpTexture.level=.03;

  const glassMat=new BABYLON.StandardMaterial("officeGlass",scene);
  glassMat.diffuseColor=new BABYLON.Color3(.45,.72,.86);
  glassMat.specularColor=new BABYLON.Color3(.9,.95,1);
  glassMat.alpha=.27;
  glassMat.backFaceCulling=false;

  officeWallMat.specularColor=new BABYLON.Color3(.018,.018,.018);
  officeWallMat.specularPower=8;
  officeFloorMat.specularColor=new BABYLON.Color3(.028,.028,.028);
  officeFloorMat.specularPower=12;
  deskMat.specularColor=new BABYLON.Color3(.10,.07,.045);
  deskMat.specularPower=22;
  deskMetalMat.specularColor=new BABYLON.Color3(.24,.26,.28);
  deskMetalMat.specularPower=58;
  chairMat.specularColor=new BABYLON.Color3(.045,.045,.05);
  chairMat.specularPower=10;
  monitorMat.specularColor=new BABYLON.Color3(.12,.13,.14);
  monitorMat.specularPower=45;

  function addCollision(mesh){
    mesh.checkCollisions=true;
    if(!collisionSurfaces.includes(mesh)) collisionSurfaces.push(mesh);
    return mesh;
  }

  function removeCollision(mesh){
    const i=collisionSurfaces.indexOf(mesh);
    if(i>=0) collisionSurfaces.splice(i,1);
    mesh.checkCollisions=false;
  }

  function box(name,pos,size,material=officeWallMat,collidable=true){
    const b=BABYLON.MeshBuilder.CreateBox(name,{
      width:size.x,height:size.y,depth:size.z
    },scene);
    b.position.copyFrom(pos);
    b.material=material;
    b.receiveShadows=true;
    if(collidable) addCollision(b);
    return b;
  }

  function childBox(name,root,pos,size,material,collidable=false){
    const m=BABYLON.MeshBuilder.CreateBox(name,{
      width:size.x,height:size.y,depth:size.z
    },scene);
    m.parent=root;
    m.position.copyFrom(pos);
    m.material=material;
    if(collidable) addCollision(m);
    return m;
  }

  function childCylinder(name,root,pos,height,diameter,material){
    const m=BABYLON.MeshBuilder.CreateCylinder(name,{
      height,diameter,tessellation:14
    },scene);
    m.parent=root;
    m.position.copyFrom(pos);
    m.material=material;
    return m;
  }

  // Office is on an upper floor. The player stays on the office floor,
  // while NPC/body pieces can fall four metres outside the windows.
  const ground=box(
    "officeFloor",
    new BABYLON.Vector3(0,-.12,-6.5),
    new BABYLON.Vector3(22.5,.24,26.0),
    officeFloorMat,
    true
  );

  const outsideGround=box(
    "streetBelow",
    new BABYLON.Vector3(0,-4.32,3.4),
    new BABYLON.Vector3(42,.25,30),
    outsideMat,
    true
  );

  // Ceiling + side walls.
  box("officeCeiling",new BABYLON.Vector3(0,4.80,-6.5),new BABYLON.Vector3(22.5,.18,26.0));
  box("officeLeftWall",new BABYLON.Vector3(-11.25,2.35,-6.5),new BABYLON.Vector3(.20,4.8,26.0));
  box("officeRightWall",new BABYLON.Vector3(11.25,2.35,-6.5),new BABYLON.Vector3(.20,4.8,26.0));

  // Front wall with an open doorway.
  box("frontWallL",new BABYLON.Vector3(-5.0,1.95,-5.2),new BABYLON.Vector3(5.95,4.0,.20));
  box("frontWallR",new BABYLON.Vector3(5.0,1.95,-5.2),new BABYLON.Vector3(5.95,4.0,.20));
  box("frontWallTop",new BABYLON.Vector3(0,3.45,-5.2),new BABYLON.Vector3(3.9,1.08,.20));

  // New rear exterior wall: the old wall at z=-4 is now an interior divider.
  box("rearOuterWall",new BABYLON.Vector3(0,2.35,-19.5),new BABYLON.Vector3(22.5,4.8,.20));

  // Window wall: sill, header and columns create three real openings.
  box("windowSill",new BABYLON.Vector3(0,.32,4),new BABYLON.Vector3(15.8,.64,.20));
  box("windowHeader",new BABYLON.Vector3(0,3.45,4),new BABYLON.Vector3(15.8,.82,.20));
  for(const x of [-7.55,-3.78,0,3.78,7.55]){
    box("windowColumn"+x,new BABYLON.Vector3(x,1.92,4),new BABYLON.Vector3(.54,2.65,.20));
  }

  function makeWindow(name,x,width=3.18){
    const g=BABYLON.MeshBuilder.CreateBox(name,{
      width,height:1.90,depth:.055
    },scene);
    g.position.set(x,1.57,3.955);
    g.material=glassMat;
    addCollision(g);
    g.metadata={
      breakableWindow:true,
      broken:false
    };
    breakableWindows.push(g);
    return g;
  }

  makeWindow("officeWindowA",-5.66);
  makeWindow("officeWindowB",-1.89);
  makeWindow("officeWindowC",1.89);
  makeWindow("officeWindowD",5.66);

  // Ceiling lights.
  const lightPanelMat=mkMat("lightPanel","#eaf6ff");
  lightPanelMat.emissiveColor=new BABYLON.Color3(.72,.82,.90);
  for(const x of [-2.5,0,2.5]){
    const p=box("ceilingLight"+x,new BABYLON.Vector3(x,2.94,0),new BABYLON.Vector3(1.25,.035,.42),lightPanelMat,false);
  }
  for(const z of [-5.2,-7.6,-10.1]){
    for(const x of [-2.4,0,2.4]){
      box("rearCeilingLight"+x+"_"+z,new BABYLON.Vector3(x,2.94,z),new BABYLON.Vector3(1.15,.035,.38),lightPanelMat,false);
    }
  }

  // Performance-friendly VR mirror.
  // It reflects the actual scene, including the potato body and hands.
  const mirrorFrame=box(
    "playerMirrorFrame",
    new BABYLON.Vector3(-11.08,1.78,-8.4),
    new BABYLON.Vector3(.10,2.55,2.30),
    darkTrimMat,
    false
  );

  const mirror=BABYLON.MeshBuilder.CreatePlane("playerMirror",{
    width:2.05,height:2.28
  },scene);
  mirror.position.set(-11.015,1.78,-8.4);
  mirror.rotation.y=Math.PI/2;
  mirror.isPickable=false;

  const mirrorMat=new BABYLON.StandardMaterial("playerMirrorMat",scene);
  mirrorMat.diffuseColor=new BABYLON.Color3(.03,.04,.05);
  mirrorMat.specularColor=new BABYLON.Color3(.55,.60,.66);
  mirrorMat.specularPower=96;

  const mirrorTex=new BABYLON.MirrorTexture("playerMirrorTexture",256,scene,true);
  // Plane x = -11.0, normal pointing into the room.
  mirrorTex.mirrorPlane=new BABYLON.Plane(1,0,0,11.0);
  mirrorTex.level=.82;
  mirrorTex.adaptiveBlurKernel=0;
  mirrorMat.reflectionTexture=mirrorTex;
  mirror.material=mirrorMat;

  // A few distant buildings outside so the room visibly feels high up.
  const distantMat=mkMat("distant","#273241");
  for(let i=0;i<8;i++){
    const h=2.5+(i%3)*1.6;
    const b=box(
      "distantBuilding"+i,
      new BABYLON.Vector3(-10.5+i*3.0,-4.15+h/2,10+(i%3)*2.5),
      new BABYLON.Vector3(2.2,h,2.4),
      distantMat,
      false
    );
  }

  function registerProp(root,hitMeshes,opts={}){
    const p={
      root,
      hitMeshes,
      type:opts.type||"prop",
      mass:opts.mass||2,
      breakThreshold:opts.breakThreshold??999,
      radius:opts.radius||.35,
      minY:opts.minY??0,
      vel:new BABYLON.Vector3(),
      ang:new BABYLON.Vector3(),
      cooldown:0,
      loose:false,
      broken:false,
      screen:opts.screen||null,
      hp:opts.hp ?? (
        opts.type==="desk" ? 44 :
        opts.type==="chair" ? 24 :
        opts.type==="monitor" ? 12 :
        opts.type==="keyboard" ? 8 :
        opts.type==="plant" ? 10 :
        opts.type==="mug" ? 5 :
        opts.type==="phone" ? 9 : 12
      ),
      maxHp:opts.hp ?? (
        opts.type==="desk" ? 44 :
        opts.type==="chair" ? 24 :
        opts.type==="monitor" ? 12 :
        opts.type==="keyboard" ? 8 :
        opts.type==="plant" ? 10 :
        opts.type==="mug" ? 5 :
        opts.type==="phone" ? 9 : 12
      ),
      sleepTimer:0,
      destructionRewarded:false,
      respawnTimer:0,
      initialPosition:root.position.clone(),
      initialRotation:root.rotation.clone(),
      initialCollisions:hitMeshes.map(m=>collisionSurfaces.includes(m))
    };
    officeProps.push(p);
    return p;
  }

  function createDesk(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,0,z);
    root.rotation.y=rot;

    const top=childBox(name+"Top",root,new BABYLON.Vector3(0,.76,0),new BABYLON.Vector3(1.58,.085,.74),deskMat,true);
    const edge=childBox(name+"FrontEdge",root,new BABYLON.Vector3(0,.725,-.345),new BABYLON.Vector3(1.58,.07,.035),darkTrimMat,false);
    const modesty=childBox(name+"Panel",root,new BABYLON.Vector3(0,.43,.30),new BABYLON.Vector3(1.35,.55,.055),deskMat,false);

    const legs=[];
    for(const lx of [-.66,.66]){
      for(const lz of [-.26,.26]){
        legs.push(childBox(
          name+"Leg"+lx+lz,root,
          new BABYLON.Vector3(lx,.37,lz),
          new BABYLON.Vector3(.065,.72,.065),
          deskMetalMat,
          false
        ));
      }
    }

    // Drawer pedestal.
    const drawerBody=childBox(
      name+"DrawerBody",root,
      new BABYLON.Vector3(.53,.39,.08),
      new BABYLON.Vector3(.38,.61,.49),
      darkTrimMat,false
    );
    const drawers=[];
    for(let i=0;i<3;i++){
      const y=.57-i*.18;
      drawers.push(childBox(
        name+"Drawer"+i,root,
        new BABYLON.Vector3(.53,y,-.175),
        new BABYLON.Vector3(.33,.135,.025),
        deskMetalMat,false
      ));
      const handle=childBox(
        name+"Handle"+i,root,
        new BABYLON.Vector3(.53,y,-.194),
        new BABYLON.Vector3(.12,.018,.018),
        trimMat,false
      );
      drawers.push(handle);
    }

    // Cable grommet and under-desk cable tray.
    const grommet=BABYLON.MeshBuilder.CreateCylinder(name+"Grommet",{
      height:.012,diameter:.085,tessellation:14
    },scene);
    grommet.parent=root;
    grommet.position.set(-.55,.808,.18);
    grommet.material=darkTrimMat;

    const cableTray=childBox(
      name+"CableTray",root,
      new BABYLON.Vector3(0,.61,.27),
      new BABYLON.Vector3(.78,.055,.12),
      darkTrimMat,false
    );

    return registerProp(root,[top,edge,modesty,...legs,drawerBody,...drawers,grommet,cableTray],{
      type:"desk",mass:13,radius:.80,minY:0,breakThreshold:11
    });
  }

  function createChair(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,0,z);
    root.rotation.y=rot;

    const seat=childBox(name+"Seat",root,new BABYLON.Vector3(0,.47,0),new BABYLON.Vector3(.50,.11,.50),chairMat,false);
    const cushion=childBox(name+"Cushion",root,new BABYLON.Vector3(0,.535,-.015),new BABYLON.Vector3(.44,.055,.43),darkTrimMat,false);
    const back=childBox(name+"Back",root,new BABYLON.Vector3(0,.82,.205),new BABYLON.Vector3(.48,.61,.075),chairMat,false);
    const backPad=childBox(name+"BackPad",root,new BABYLON.Vector3(0,.82,.155),new BABYLON.Vector3(.41,.50,.035),darkTrimMat,false);

    const stem=childCylinder(name+"Stem",root,new BABYLON.Vector3(0,.255,0),.37,.072,deskMetalMat);

    // Armrests.
    const armMeshes=[];
    for(const sx of [-1,1]){
      armMeshes.push(childCylinder(
        name+"ArmStem"+sx,root,
        new BABYLON.Vector3(sx*.29,.60,.04),
        .28,.04,deskMetalMat
      ));
      armMeshes.push(childBox(
        name+"ArmPad"+sx,root,
        new BABYLON.Vector3(sx*.29,.73,-.02),
        new BABYLON.Vector3(.08,.045,.34),
        chairMat,false
      ));
    }

    // Five-star rolling base and wheels.
    const baseHub=BABYLON.MeshBuilder.CreateCylinder(name+"Hub",{
      height:.055,diameter:.18,tessellation:14
    },scene);
    baseHub.parent=root;baseHub.position.y=.075;baseHub.material=deskMetalMat;

    const baseMeshes=[baseHub];
    for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2;
      const spoke=childBox(
        name+"Spoke"+i,root,
        new BABYLON.Vector3(Math.cos(a)*.17,.067,Math.sin(a)*.17),
        new BABYLON.Vector3(.38,.035,.045),
        deskMetalMat,false
      );
      spoke.rotation.y=-a;
      baseMeshes.push(spoke);

      const wheel=BABYLON.MeshBuilder.CreateTorus(name+"Wheel"+i,{
        diameter:.075,thickness:.025,tessellation:10
      },scene);
      wheel.parent=root;
      wheel.position.set(Math.cos(a)*.38,.045,Math.sin(a)*.38);
      wheel.rotation.z=Math.PI/2;
      wheel.material=chairMat;
      baseMeshes.push(wheel);
    }

    return registerProp(root,[seat,cushion,back,backPad,stem,...armMeshes,...baseMeshes],{
      type:"chair",mass:2.5,radius:.46,minY:0,breakThreshold:8
    });
  }

  function createMonitor(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.82,z);
    root.rotation.y=rot;

    const housing=childBox(name+"Housing",root,new BABYLON.Vector3(0,.30,0),new BABYLON.Vector3(.59,.38,.080),monitorMat,false);
    const bezel=childBox(name+"Bezel",root,new BABYLON.Vector3(0,.30,-.044),new BABYLON.Vector3(.55,.34,.016),darkTrimMat,false);
    const screen=childBox(name+"Screen",root,new BABYLON.Vector3(0,.305,-.054),new BABYLON.Vector3(.505,.292,.008),screenMat,false);

    const stand=childCylinder(name+"Stand",root,new BABYLON.Vector3(0,.105,.02),.24,.047,deskMetalMat);
    const hinge=BABYLON.MeshBuilder.CreateCylinder(name+"Hinge",{
      height:.16,diameter:.055,tessellation:12
    },scene);
    hinge.parent=root;hinge.position.set(0,.175,.035);hinge.rotation.z=Math.PI/2;hinge.material=deskMetalMat;

    const foot=childBox(name+"Foot",root,new BABYLON.Vector3(0,-.025,.035),new BABYLON.Vector3(.31,.035,.21),deskMetalMat,false);

    const led=BABYLON.MeshBuilder.CreateSphere(name+"LED",{diameter:.018,segments:7},scene);
    led.parent=root;led.position.set(.25,.145,-.061);
    led.material=blueMat;
    blueMat.emissiveColor=new BABYLON.Color3(.1,.35,.7);

    // Back vent strips.
    const vents=[];
    for(let i=0;i<5;i++){
      vents.push(childBox(
        name+"Vent"+i,root,
        new BABYLON.Vector3(-.16+i*.08,.31,.045),
        new BABYLON.Vector3(.045,.12,.008),
        darkTrimMat,false
      ));
    }

    return registerProp(root,[housing,bezel,screen,stand,hinge,foot,led,...vents],{
      type:"monitor",mass:1.25,radius:.36,minY:.18,breakThreshold:2.0,screen
    });
  }

  function createKeyboard(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.82,z);
    root.rotation.y=rot;

    const body=childBox(name+"Body",root,new BABYLON.Vector3(0,.018,0),new BABYLON.Vector3(.49,.035,.18),keyboardMat,false);
    const keys=[body];

    for(let row=0;row<3;row++){
      for(let col=0;col<9;col++){
        keys.push(childBox(
          name+"Key"+row+"_"+col,root,
          new BABYLON.Vector3(-.205+col*.051,.041,-.052+row*.052),
          new BABYLON.Vector3(.039,.015,.038),
          darkTrimMat,false
        ));
      }
    }

    keys.push(childBox(
      name+"Space",root,
      new BABYLON.Vector3(0,.041,.105),
      new BABYLON.Vector3(.19,.015,.032),
      darkTrimMat,false
    ));

    return registerProp(root,keys,{
      type:"keyboard",mass:.35,radius:.25,minY:.04,breakThreshold:4.2,hp:8
    });
  }

  function createBin(name,x,z){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,0,z);
    const body=BABYLON.MeshBuilder.CreateCylinder(name+"Body",{
      height:.46,diameterTop:.40,diameterBottom:.32,tessellation:16
    },scene);
    body.parent=root;
    body.position.y=.23;
    body.material=deskMetalMat;
    return registerProp(root,[body],{
      type:"bin",mass:.7,radius:.23,minY:0,breakThreshold:7
    });
  }

  function createPlant(name,x,z){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,0,z);

    const pot=BABYLON.MeshBuilder.CreateCylinder(name+"Pot",{
      height:.34,diameterTop:.34,diameterBottom:.24,tessellation:14
    },scene);
    pot.parent=root;pot.position.y=.17;pot.material=potMat;

    const stalk=childCylinder(name+"Stalk",root,new BABYLON.Vector3(0,.53,0),.48,.045,plantMat);

    const leaves=[];
    for(let i=0;i<5;i++){
      const l=BABYLON.MeshBuilder.CreateSphere(name+"Leaf"+i,{diameter:.24,segments:10},scene);
      l.parent=root;
      const a=i/5*Math.PI*2;
      l.position.set(Math.cos(a)*.13,.67+Math.sin(a*2)*.05,Math.sin(a)*.13);
      l.scaling.set(1.25,.55,.70);
      l.material=plantMat;
      leaves.push(l);
    }

    return registerProp(root,[pot,stalk,...leaves],{
      type:"plant",mass:.9,radius:.34,minY:0,breakThreshold:4.5
    });
  }

  // Main office furniture layout.
  const deskLayout=[
    [-2.65,-1.25,0],
    [1.55,-1.25,0],
    [-2.65,1.35,Math.PI],
    [1.55,1.35,Math.PI]
  ];

  deskLayout.forEach((d,i)=>{
    createDesk("desk"+i,d[0],d[1],d[2]);

    const facing=d[2];
    const monitorZ=d[1]+(facing===0?.10:-.10);
    createMonitor("monitor"+i,d[0],monitorZ,facing);
    createKeyboard("keyboard"+i,d[0],d[1]+(facing===0?-.22:.22),facing);

    createChair(
      "chair"+i,
      d[0],
      d[1]+(facing===0?-.72:.72),
      facing
    );
  });

  deskLayout.forEach((d,i)=>{
    const cable=BABYLON.MeshBuilder.CreateTorus("monitorCable"+i,{diameter:.28,thickness:.012,tessellation:14},scene);
    cable.position.set(d[0]+.30,.53,d[1]+.25);
    cable.rotation.x=Math.PI/2;cable.material=darkTrimMat;

    // Treat the loose cable/ring as a physical desk item.
    registerProp(cable,[cable],{
      type:"cable",mass:.06,radius:.15,minY:.02,breakThreshold:99,hp:4
    });
  });

  createBin("binA",-4.15,-2.7);
  createBin("binB",4.05,2.6);
  createPlant("plantA",-4.28,2.65);
  createPlant("plantB",4.25,-2.65);

  // Low office divider/cabinet.
  box("cabinetA",new BABYLON.Vector3(-4.10,.55,.05),new BABYLON.Vector3(.62,1.10,2.0),deskMetalMat,true);
  box("cabinetB",new BABYLON.Vector3(4.10,.55,.05),new BABYLON.Vector3(.62,1.10,2.0),deskMetalMat,true);

  // ------------------------------------------------------------
  // Office detail pass
  // ------------------------------------------------------------

  // Baseboards / wall trim.
  box("baseboardLeft",new BABYLON.Vector3(-11.13,.09,-7.75),new BABYLON.Vector3(.055,.16,11.65),trimMat,false);
  box("baseboardRight",new BABYLON.Vector3(11.13,.09,-7.75),new BABYLON.Vector3(.055,.16,11.65),trimMat,false);
  box("baseboardFrontL",new BABYLON.Vector3(-4.98,.09,-5.08),new BABYLON.Vector3(5.00,.16,.055),trimMat,false);
  box("baseboardFrontR",new BABYLON.Vector3(4.98,.09,-5.08),new BABYLON.Vector3(5.00,.16,.055),trimMat,false);

  // Carpet tile seams.
  for(let x=-10;x<=10;x+=1){
    box("carpetLineX"+x,new BABYLON.Vector3(x,.008,-7.7),new BABYLON.Vector3(.009,.006,11.8),darkTrimMat,false);
  }
  for(let z=-18;z<=3;z+=1){
    box("carpetLineZ"+z,new BABYLON.Vector3(0,.009,z),new BABYLON.Vector3(10.95,.006,.009),darkTrimMat,false);
  }

  // Window frames and simple blinds.
  for(const x of [-5.66,-1.89,1.89,5.66]){
    box("windowFrameTop"+x,new BABYLON.Vector3(x,3.05,3.91),new BABYLON.Vector3(3.25,.055,.07),darkTrimMat,false);
    box("windowFrameBottom"+x,new BABYLON.Vector3(x,.61,3.91),new BABYLON.Vector3(3.25,.055,.07),darkTrimMat,false);
    box("windowFrameL"+x,new BABYLON.Vector3(x-1.60,1.83,3.91),new BABYLON.Vector3(.05,2.42,.07),darkTrimMat,false);
    box("windowFrameR"+x,new BABYLON.Vector3(x+1.60,1.83,3.91),new BABYLON.Vector3(.05,2.42,.07),darkTrimMat,false);
    box("windowCross"+x,new BABYLON.Vector3(x,1.84,3.91),new BABYLON.Vector3(3.20,.035,.055),darkTrimMat,false);

    for(let i=0;i<4;i++){
      box(
        "blind"+x+"_"+i,
        new BABYLON.Vector3(x,2.42-i*.11,3.86),
        new BABYLON.Vector3(2.52,.018,.045),
        trimMat,false
      );
    }
  }

  // Door frame and open door.
  box("doorFrameL",new BABYLON.Vector3(-1.55,1.25,-3.86),new BABYLON.Vector3(.10,2.50,.11),darkTrimMat,false);
  box("doorFrameR",new BABYLON.Vector3(1.55,1.25,-3.86),new BABYLON.Vector3(.10,2.50,.11),darkTrimMat,false);
  box("doorFrameTop",new BABYLON.Vector3(0,2.48,-3.86),new BABYLON.Vector3(3.18,.10,.11),darkTrimMat,false);

  const doorRoot=new BABYLON.TransformNode("openOfficeDoor",scene);
  doorRoot.position.set(-1.46,0,-3.73);
  doorRoot.rotation.y=-.62;
  const door=childBox("doorSlab",doorRoot,new BABYLON.Vector3(.67,1.18,0),new BABYLON.Vector3(1.34,2.35,.07),deskMat,false);
  const handle=BABYLON.MeshBuilder.CreateSphere("doorHandle",{diameter:.08,segments:10},scene);
  handle.parent=doorRoot;handle.position.set(1.18,1.15,-.07);handle.material=deskMetalMat;

  function createMug(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.84,z);root.rotation.y=rot;

    const cup=BABYLON.MeshBuilder.CreateCylinder(name+"Cup",{
      height:.14,diameterTop:.12,diameterBottom:.105,tessellation:14
    },scene);
    cup.parent=root;cup.position.y=.07;cup.material=mugMat;

    const handle=BABYLON.MeshBuilder.CreateTorus(name+"Handle",{
      diameter:.10,thickness:.022,tessellation:12
    },scene);
    handle.parent=root;handle.position.set(.07,.075,0);
    handle.rotation.z=Math.PI/2;handle.material=mugMat;

    const coffee=BABYLON.MeshBuilder.CreateCylinder(name+"Coffee",{
      height:.008,diameter:.095,tessellation:14
    },scene);
    coffee.parent=root;coffee.position.y=.142;coffee.material=darkTrimMat;

    return registerProp(root,[cup,handle,coffee],{
      type:"mug",mass:.28,radius:.10,minY:.02,breakThreshold:3
    });
  }

  function createMouse(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.835,z);root.rotation.y=rot;

    const mouse=BABYLON.MeshBuilder.CreateSphere(name+"Body",{diameter:.12,segments:12},scene);
    mouse.parent=root;mouse.scaling.set(.72,.34,1.05);mouse.material=keyboardMat;

    const wheel=BABYLON.MeshBuilder.CreateCylinder(name+"Wheel",{
      height:.022,diameter:.026,tessellation:9
    },scene);
    wheel.parent=root;wheel.position.set(0,.038,-.025);wheel.rotation.z=Math.PI/2;wheel.material=darkTrimMat;

    return registerProp(root,[mouse,wheel],{
      type:"mouse",mass:.12,radius:.08,minY:.02,breakThreshold:6
    });
  }

  function createPaperStack(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.84,z);root.rotation.y=rot;
    const papers=[];
    for(let i=0;i<5;i++){
      const p=childBox(
        name+"Paper"+i,root,
        new BABYLON.Vector3((i%2)*.006,i*.006,(i%3)*.004),
        new BABYLON.Vector3(.27,.005,.20),
        paperMat,false
      );
      p.rotation.y=(i-2)*.025;
      papers.push(p);
    }
    return registerProp(root,papers,{
      type:"papers",mass:.10,radius:.16,minY:.01,breakThreshold:7
    });
  }

  function createDeskPhone(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.84,z);root.rotation.y=rot;
    const base=childBox(name+"Base",root,new BABYLON.Vector3(0,.035,0),new BABYLON.Vector3(.27,.07,.19),keyboardMat,false);
    const handset=childBox(name+"Handset",root,new BABYLON.Vector3(0,.095,0),new BABYLON.Vector3(.25,.055,.065),darkTrimMat,false);
    for(const sx of [-1,1]){
      const ear=BABYLON.MeshBuilder.CreateSphere(name+"Ear"+sx,{diameter:.075,segments:9},scene);
      ear.parent=root;ear.position.set(sx*.105,.10,0);ear.scaling.set(.72,1,.90);ear.material=darkTrimMat;
    }
    return registerProp(root,[base,handset],{
      type:"phone",mass:.42,radius:.17,minY:.02,breakThreshold:5
    });
  }

  deskLayout.forEach((d,i)=>{
    const facing=d[2];
    const front=(facing===0?-1:1);
    createMug("mug"+i,d[0]-.50,d[1]+front*.16,facing);
    createMouse("mouse"+i,d[0]+.39,d[1]+front*.22,facing);
    createPaperStack("papers"+i,d[0]-.25,d[1]-front*.17,facing);
    if(i===1) createDeskPhone("deskPhone",d[0]+.48,d[1]-front*.15,facing);
  });

  // Whiteboard with frame and sticky notes.
  const whiteboardRoot=new BABYLON.TransformNode("whiteboard",scene);
  whiteboardRoot.position.set(-4.84,1.62,-1.45);
  whiteboardRoot.rotation.y=Math.PI/2;
  const whiteboard=childBox("whiteboardPanel",whiteboardRoot,new BABYLON.Vector3(0,0,0),new BABYLON.Vector3(2.10,1.05,.035),boardMat,false);
  childBox("whiteboardTop",whiteboardRoot,new BABYLON.Vector3(0,.55,-.01),new BABYLON.Vector3(2.22,.055,.055),darkTrimMat,false);
  childBox("whiteboardBottom",whiteboardRoot,new BABYLON.Vector3(0,-.55,-.01),new BABYLON.Vector3(2.22,.055,.055),darkTrimMat,false);
  childBox("whiteboardL",whiteboardRoot,new BABYLON.Vector3(-1.08,0,-.01),new BABYLON.Vector3(.055,1.15,.055),darkTrimMat,false);
  childBox("whiteboardR",whiteboardRoot,new BABYLON.Vector3(1.08,0,-.01),new BABYLON.Vector3(.055,1.15,.055),darkTrimMat,false);
  for(let i=0;i<7;i++){
    const note=childBox(
      "sticky"+i,whiteboardRoot,
      new BABYLON.Vector3(-.75+(i%4)*.42,.25-Math.floor(i/4)*.40,-.025),
      new BABYLON.Vector3(.22,.18,.007),
      i%3===0?paperMat:i%3===1?blueMat:redMat,
      false
    );
    note.rotation.z=(i-3)*.025;
  }

  // Wall clock.
  const clockRoot=new BABYLON.TransformNode("clockRoot",scene);
  clockRoot.position.set(4.84,2.22,-1.65);
  clockRoot.rotation.y=-Math.PI/2;
  const clockFace=BABYLON.MeshBuilder.CreateCylinder("clockFace",{
    height:.035,diameter:.48,tessellation:24
  },scene);
  clockFace.parent=clockRoot;clockFace.rotation.z=Math.PI/2;clockFace.material=boardMat;
  const clockRim=BABYLON.MeshBuilder.CreateTorus("clockRim",{
    diameter:.49,thickness:.025,tessellation:24
  },scene);
  clockRim.parent=clockRoot;clockRim.rotation.z=Math.PI/2;clockRim.material=darkTrimMat;

  // Bookshelf.
  const shelfRoot=new BABYLON.TransformNode("bookshelf",scene);
  shelfRoot.position.set(4.55,0,2.50);
  childBox("shelfBody",shelfRoot,new BABYLON.Vector3(0,.82,0),new BABYLON.Vector3(.72,1.64,.38),darkTrimMat,false);
  for(let y of [.32,.76,1.20]){
    childBox("shelf"+y,shelfRoot,new BABYLON.Vector3(0,y,0),new BABYLON.Vector3(.67,.045,.36),trimMat,false);
  }
  const bookMats=[bookMatA,bookMatB,bookMatC,paperMat];
  let bi=0;
  for(let row=0;row<3;row++){
    for(let col=0;col<5;col++){
      const h=.22+((col+row)%3)*.045;
      const bk=childBox(
        "book"+bi,shelfRoot,
        new BABYLON.Vector3(-.24+col*.12,.39+row*.44+h/2,.01),
        new BABYLON.Vector3(.075,h,.25),
        bookMats[bi%bookMats.length],false
      );
      bk.rotation.z=(col%2?.025:-.02);
      bi++;
    }
  }

  // Printer/copier.
  const printerRoot=new BABYLON.TransformNode("printer",scene);
  printerRoot.position.set(3.90,1.12,-.15);
  const printerBody=childBox("printerBody",printerRoot,new BABYLON.Vector3(0,.20,0),new BABYLON.Vector3(.55,.38,.48),trimMat,false);
  const printerTop=childBox("printerTop",printerRoot,new BABYLON.Vector3(0,.43,.02),new BABYLON.Vector3(.48,.10,.42),darkTrimMat,false);
  const printerScreen=childBox("printerScreen",printerRoot,new BABYLON.Vector3(.16,.47,-.215),new BABYLON.Vector3(.14,.08,.015),screenMat,false);
  const paperTray=childBox("paperTray",printerRoot,new BABYLON.Vector3(0,.08,-.27),new BABYLON.Vector3(.42,.045,.18),darkTrimMat,false);

  // Water cooler.
  const coolerRoot=new BABYLON.TransformNode("waterCooler",scene);
  coolerRoot.position.set(-4.25,0,-2.15);
  const coolerBody=childBox("coolerBody",coolerRoot,new BABYLON.Vector3(0,.48,0),new BABYLON.Vector3(.38,.86,.35),trimMat,false);
  const bottleMat=new BABYLON.StandardMaterial("waterBottleMat",scene);
  bottleMat.diffuseColor=new BABYLON.Color3(.35,.65,.82);bottleMat.alpha=.42;
  const bottle=BABYLON.MeshBuilder.CreateCylinder("waterBottle",{
    height:.46,diameterTop:.22,diameterBottom:.30,tessellation:16
  },scene);
  bottle.parent=coolerRoot;bottle.position.y=1.05;bottle.material=bottleMat;
  const tapBlue=BABYLON.MeshBuilder.CreateSphere("tapBlue",{diameter:.055,segments:8},scene);
  tapBlue.parent=coolerRoot;tapBlue.position.set(-.07,.58,-.19);tapBlue.material=blueMat;
  const tapRed=tapBlue.clone("tapRed");tapRed.parent=coolerRoot;tapRed.position.x=.07;tapRed.material=redMat;

  registerProp(doorRoot,[door,handle],{
    type:"door",mass:8.5,radius:.82,minY:0,breakThreshold:7.8,hp:32
  });
  registerProp(whiteboardRoot,[whiteboard],{
    type:"whiteboard",mass:4.5,radius:1.0,minY:.45,breakThreshold:8.5,hp:24
  });
  registerProp(printerRoot,[printerBody,printerTop,printerScreen,paperTray],{
    type:"printer",mass:5.5,radius:.45,minY:.70,breakThreshold:5.8,hp:22
  });
  registerProp(coolerRoot,[coolerBody,bottle,tapBlue,tapRed],{
    type:"cooler",mass:4.0,radius:.42,minY:0,breakThreshold:5.5,hp:20
  });

  // Fire extinguisher.
  const extinguisher=BABYLON.MeshBuilder.CreateCylinder("extinguisher",{
    height:.62,diameter:.20,tessellation:16
  },scene);
  extinguisher.position.set(2.05,.32,-3.72);extinguisher.material=redMat;
  const extingTop=BABYLON.MeshBuilder.CreateCylinder("extinguisherTop",{
    height:.08,diameter:.12,tessellation:12
  },scene);
  extingTop.position.set(2.05,.67,-3.72);extingTop.material=darkTrimMat;

  // Ceiling air vents.
  for(const x of [-3.3,3.3]){
    const vent=box("ceilingVent"+x,new BABYLON.Vector3(x,2.93,2.15),new BABYLON.Vector3(.72,.025,.42),darkTrimMat,false);
    for(let i=0;i<5;i++){
      box(
        "ventSlat"+x+"_"+i,
        new BABYLON.Vector3(x-.26+i*.13,2.912,2.15),
        new BABYLON.Vector3(.025,.012,.34),
        trimMat,false
      );
    }
  }


  // Extra detail in the SAME office footprint.
  function makeMousePad(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.833,z);root.rotation.y=rot;
    const pad=childBox(name+"Pad",root,new BABYLON.Vector3(),new BABYLON.Vector3(.30,.008,.24),darkTrimMat,false);
    return registerProp(root,[pad],{type:"mousepad",mass:.08,radius:.17,minY:.01,breakThreshold:20,hp:5});
  }

  function makePenCup(name,x,z){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.84,z);
    const cup=BABYLON.MeshBuilder.CreateCylinder(name+"Cup",{height:.14,diameter:.10,tessellation:14},scene);
    cup.parent=root;cup.position.y=.07;cup.material=deskMetalMat;
    const parts=[cup];
    for(let i=0;i<4;i++){
      const pen=BABYLON.MeshBuilder.CreateCylinder(name+"Pen"+i,{height:.20,diameter:.012,tessellation:7},scene);
      pen.parent=root;pen.position.set((i-1.5)*.015,.15,(i%2)*.018-.009);
      pen.rotation.z=(i-1.5)*.08;pen.material=i%2?blueMat:redMat;parts.push(pen);
    }
    return registerProp(root,parts,{type:"pencup",mass:.22,radius:.11,minY:.02,breakThreshold:5,hp:6});
  }

  function makeStapler(name,x,z,rot=0){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,.84,z);root.rotation.y=rot;
    const base=childBox(name+"Base",root,new BABYLON.Vector3(0,.018,0),new BABYLON.Vector3(.16,.03,.055),darkTrimMat,false);
    const top=childBox(name+"Top",root,new BABYLON.Vector3(0,.045,-.005),new BABYLON.Vector3(.15,.035,.05),deskMetalMat,false);
    top.rotation.x=-.12;
    return registerProp(root,[base,top],{type:"stapler",mass:.18,radius:.10,minY:.02,breakThreshold:7,hp:7});
  }

  deskLayout.forEach((d,i)=>{
    const facing=d[2], f=facing===0?-1:1;
    makeMousePad("mousePad"+i,d[0]+.38,d[1]+f*.22,facing);
    makePenCup("penCup"+i,d[0]-.58,d[1]-f*.18);
    if(i%2===0) makeStapler("stapler"+i,d[0]+.55,d[1]-f*.18,facing);
  });

  for(const [x,z,ry] of [
    [-4.87,-2.8,Math.PI/2],[-4.87,1.9,Math.PI/2],
    [4.87,-2.5,-Math.PI/2],[4.87,2.0,-Math.PI/2]
  ]){
    const outlet=box("wallOutlet"+x+z,new BABYLON.Vector3(x,.34,z),new BABYLON.Vector3(.08,.12,.018),paperMat,false);
    outlet.rotation.y=ry;
  }

  const smoke=BABYLON.MeshBuilder.CreateCylinder("smokeDetector",{height:.045,diameter:.24,tessellation:20},scene);
  smoke.position.set(0,2.93,-2.2);smoke.material=trimMat;

  const camRoot=new BABYLON.TransformNode("securityCamera",scene);
  camRoot.position.set(4.55,2.48,-3.45);camRoot.rotation.y=-2.25;
  childBox("securityCamBody",camRoot,new BABYLON.Vector3(),new BABYLON.Vector3(.26,.14,.16),trimMat,false);
  const lens=BABYLON.MeshBuilder.CreateCylinder("securityCamLens",{height:.055,diameter:.08,tessellation:14},scene);
  lens.parent=camRoot;lens.position.set(0,0,-.11);lens.rotation.x=Math.PI/2;lens.material=darkTrimMat;

  // floor paper clutter removed in v0.23.4


  // ------------------------------------------------------------
  // LARGE REAR OFFICE WING (z -4 to -9)
  // Same building, now more than 60% deeper.
  // ------------------------------------------------------------

  // Baseboards in the new wing.
  box("rearBaseboardWall",new BABYLON.Vector3(0,.09,-8.88),new BABYLON.Vector3(9.70,.16,.055),trimMat,false);
  box("rearLeftBaseboard",new BABYLON.Vector3(-4.88,.09,-6.5),new BABYLON.Vector3(.055,.16,4.75),trimMat,false);
  box("rearRightBaseboard",new BABYLON.Vector3(4.88,.09,-6.5),new BABYLON.Vector3(.055,.16,4.75),trimMat,false);

  // Corridor flooring strips.
  for(let z=-4.5;z>=-8.5;z-=1){
    box(
      "rearCarpetSeam"+z,
      new BABYLON.Vector3(0,.009,z),
      new BABYLON.Vector3(9.7,.006,.009),
      darkTrimMat,false
    );
  }

  // Two interior glass meeting-room walls with open doors.
  const meetingGlassMat=new BABYLON.StandardMaterial("meetingGlass",scene);
  meetingGlassMat.diffuseColor=new BABYLON.Color3(.55,.75,.84);
  meetingGlassMat.alpha=.22;
  meetingGlassMat.specularColor=new BABYLON.Color3(.85,.9,.95);
  meetingGlassMat.backFaceCulling=false;

  // Left meeting room partition.
  box("meetingLeftWallA",new BABYLON.Vector3(-2.95,1.48,-5.15),new BABYLON.Vector3(3.65,2.88,.055),meetingGlassMat,true);
  box("meetingLeftWallB",new BABYLON.Vector3(-.55,1.48,-5.15),new BABYLON.Vector3(.82,2.88,.055),meetingGlassMat,true);

  // Right office / break area partition.
  box("meetingRightWallA",new BABYLON.Vector3(.75,1.48,-6.4),new BABYLON.Vector3(.055,2.88,4.95),meetingGlassMat,true);

  // Metal framing on meeting glass.
  for(const x of [-4.72,-3.70,-2.68,-1.66,-.64]){
    box("meetingFrame"+x,new BABYLON.Vector3(x,1.48,-5.12),new BABYLON.Vector3(.032,2.9,.07),darkTrimMat,false);
  }
  for(const y of [.62,1.55,2.45]){
    box("meetingFrameY"+y,new BABYLON.Vector3(-2.72,y,-5.12),new BABYLON.Vector3(4.0,.028,.07),darkTrimMat,false);
  }

  function createConferenceTable(){
    const root=new BABYLON.TransformNode("conferenceTable",scene);
    root.position.set(-2.25,0,-7.05);

    const top=childBox(
      "conferenceTop",root,
      new BABYLON.Vector3(0,.76,0),
      new BABYLON.Vector3(3.55,.10,1.18),
      deskMat,true
    );

    // Rounded-looking center sections using cylinders.
    const legs=[];
    for(const x of [-1.25,1.25]){
      const leg=childCylinder(
        "conferenceLeg"+x,root,
        new BABYLON.Vector3(x,.37,0),
        .70,.15,deskMetalMat
      );
      legs.push(leg);
      const foot=childBox(
        "conferenceFoot"+x,root,
        new BABYLON.Vector3(x,.06,0),
        new BABYLON.Vector3(.65,.055,.45),
        deskMetalMat,false
      );
      legs.push(foot);
    }

    // Cable/power hatch.
    const hatch=childBox(
      "conferencePowerHatch",root,
      new BABYLON.Vector3(0,.818,0),
      new BABYLON.Vector3(.42,.018,.16),
      darkTrimMat,false
    );

    return registerProp(root,[top,...legs,hatch],{
      type:"desk",mass:22,radius:1.45,minY:0,breakThreshold:12,hp:70
    });
  }

  createConferenceTable();

  // Six meeting chairs.
  [
    [-3.55,-6.55,Math.PI/2],[-3.55,-7.55,Math.PI/2],
    [-.95,-6.55,-Math.PI/2],[-.95,-7.55,-Math.PI/2],
    [-2.25,-6.15,Math.PI],[-2.25,-7.95,0]
  ].forEach((p,i)=>createChair("meetingChair"+i,p[0],p[1],p[2]));

  // Large conference display.
  const bigScreen=box(
    "conferenceDisplay",
    new BABYLON.Vector3(-2.25,1.70,-8.87),
    new BABYLON.Vector3(1.85,1.05,.055),
    monitorMat,false
  );
  const bigScreenInner=box(
    "conferenceDisplayInner",
    new BABYLON.Vector3(-2.25,1.70,-8.835),
    new BABYLON.Vector3(1.72,.92,.012),
    screenMat,false
  );
  const cam=BABYLON.MeshBuilder.CreateSphere("conferenceCamera",{diameter:.055,segments:9},scene);
  cam.position.set(-2.25,2.28,-8.80);cam.material=darkTrimMat;

  // Break-room counter on right.
  const counterRoot=new BABYLON.TransformNode("breakCounter",scene);
  counterRoot.position.set(2.90,0,-7.95);
  const counter=childBox(
    "breakCounterBody",counterRoot,
    new BABYLON.Vector3(0,.48,0),
    new BABYLON.Vector3(3.30,.92,.62),
    trimMat,true
  );
  const counterTop=childBox(
    "breakCounterTop",counterRoot,
    new BABYLON.Vector3(0,.97,0),
    new BABYLON.Vector3(3.42,.08,.70),
    deskMat,false
  );
  registerProp(counterRoot,[counter,counterTop],{
    type:"desk",mass:20,radius:1.2,minY:0,breakThreshold:13,hp:65
  });

  // Kitchen sink.
  const sink=BABYLON.MeshBuilder.CreateBox("breakSink",{
    width:.58,height:.035,depth:.38
  },scene);
  sink.position.set(2.55,1.025,-7.95);sink.material=deskMetalMat;
  const faucet=BABYLON.MeshBuilder.CreateTorus("breakFaucet",{
    diameter:.22,thickness:.025,tessellation:16
  },scene);
  faucet.position.set(2.55,1.16,-7.78);faucet.rotation.x=Math.PI/2;faucet.material=deskMetalMat;

  // Coffee machine.
  const coffeeRoot=new BABYLON.TransformNode("coffeeMachine",scene);
  coffeeRoot.position.set(3.55,1.02,-7.93);
  const coffeeBody=childBox("coffeeBody",coffeeRoot,new BABYLON.Vector3(0,.20,0),new BABYLON.Vector3(.42,.42,.33),monitorMat,false);
  const coffeePanel=childBox("coffeePanel",coffeeRoot,new BABYLON.Vector3(0,.22,-.18),new BABYLON.Vector3(.28,.18,.015),screenMat,false);
  const nozzle=childCylinder("coffeeNozzle",coffeeRoot,new BABYLON.Vector3(0,.03,-.19),.10,.035,deskMetalMat);
  registerProp(coffeeRoot,[coffeeBody,coffeePanel,nozzle],{
    type:"printer",mass:3.5,radius:.28,minY:.95,breakThreshold:5.5,hp:18
  });

  // Fridge.
  const fridgeRoot=new BABYLON.TransformNode("officeFridge",scene);
  fridgeRoot.position.set(4.22,0,-6.85);
  const fridge=childBox(
    "officeFridgeBody",fridgeRoot,
    new BABYLON.Vector3(0,.92,0),
    new BABYLON.Vector3(.72,1.84,.68),
    trimMat,true
  );
  const fridgeLine=childBox(
    "officeFridgeLine",fridgeRoot,
    new BABYLON.Vector3(0,1.17,-.35),
    new BABYLON.Vector3(.66,.025,.015),
    darkTrimMat,false
  );
  const fridgeHandle=childBox(
    "officeFridgeHandle",fridgeRoot,
    new BABYLON.Vector3(.25,1.12,-.37),
    new BABYLON.Vector3(.035,.62,.03),
    deskMetalMat,false
  );
  registerProp(fridgeRoot,[fridge,fridgeLine,fridgeHandle],{
    type:"cooler",mass:18,radius:.60,minY:0,breakThreshold:11,hp:55
  });

  // Lockers.
  for(let i=0;i<4;i++){
    const x=.95+i*.58;
    const locker=box(
      "locker"+i,
      new BABYLON.Vector3(x,.95,-8.72),
      new BABYLON.Vector3(.52,1.88,.42),
      deskMetalMat,false
    );
    const doorDetail=box(
      "lockerDoor"+i,
      new BABYLON.Vector3(x,.95,-8.49),
      new BABYLON.Vector3(.46,1.72,.025),
      darkTrimMat,false
    );
    for(let s=0;s<4;s++){
      box(
        "lockerVent"+i+"_"+s,
        new BABYLON.Vector3(x,.50+s*.08,-8.47),
        new BABYLON.Vector3(.22,.018,.01),
        trimMat,false
      );
    }
  }

  // Wall posters / notice frames.
  for(let i=0;i<4;i++){
    const z=-5.0-i*.80;
    const frame=box(
      "hallFrame"+i,
      new BABYLON.Vector3(4.86,1.55,z),
      new BABYLON.Vector3(.025,.62,.45),
      darkTrimMat,false
    );
    const poster=box(
      "hallPoster"+i,
      new BABYLON.Vector3(4.84,1.55,z),
      new BABYLON.Vector3(.015,.54,.37),
      i%2?blueMat:paperMat,false
    );
  }

  // Small wall lamps and emergency exit sign.
  const exitMat=mkMat("exitSignMat","#19a95b");
  exitMat.emissiveColor=new BABYLON.Color3(.06,.55,.20);
  const exitSign=box(
    "exitSign",
    new BABYLON.Vector3(0,2.48,-8.87),
    new BABYLON.Vector3(.65,.24,.04),
    exitMat,false
  );

  // Extra desk cluster in the new wing.
  createDesk("rearDeskA",1.65,-5.15,0);
  createMonitor("rearMonitorA",1.65,-5.03,0);
  createKeyboard("rearKeyboardA",1.65,-5.38,0);
  createChair("rearChairA",1.65,-5.88,0);

  createDesk("rearDeskB",3.45,-5.15,0);
  createMonitor("rearMonitorB",3.45,-5.03,0);
  createKeyboard("rearKeyboardB",3.45,-5.38,0);
  createChair("rearChairB",3.45,-5.88,0);

  createDesk("wideDeskL",-6.45,-9.55,0);
  createMonitor("wideMonitorL",-6.45,-9.43,0);
  createKeyboard("wideKeyboardL",-6.45,-9.78,0);
  createChair("wideChairL",-6.45,-10.28,0);

  createDesk("wideDeskR",6.45,-9.55,0);
  createMonitor("wideMonitorR",6.45,-9.43,0);
  createKeyboard("wideKeyboardR",6.45,-9.78,0);
  createChair("wideChairR",6.45,-10.28,0);

  createDesk("deepDeskL",-5.0,-13.0,Math.PI);
  createMonitor("deepMonitorL",-5.0,-13.12,Math.PI);
  createKeyboard("deepKeyboardL",-5.0,-12.77,Math.PI);
  createChair("deepChairL",-5.0,-12.20,Math.PI);

  createDesk("deepDeskR",5.0,-13.0,Math.PI);
  createMonitor("deepMonitorR",5.0,-13.12,Math.PI);
  createKeyboard("deepKeyboardR",5.0,-12.77,Math.PI);
  createChair("deepChairR",5.0,-12.20,Math.PI);

  createDesk("farDeskL",-7.3,-16.2,0);
  createMonitor("farMonitorL",-7.3,-16.08,0);
  createKeyboard("farKeyboardL",-7.3,-16.43,0);
  createChair("farChairL",-7.3,-16.93,0);

  createDesk("farDeskC",0,-16.2,0);
  createMonitor("farMonitorC",0,-16.08,0);
  createKeyboard("farKeyboardC",0,-16.43,0);
  createChair("farChairC",0,-16.93,0);

  createDesk("farDeskR",7.3,-16.2,0);
  createMonitor("farMonitorR",7.3,-16.08,0);
  createKeyboard("farKeyboardR",7.3,-16.43,0);
  createChair("farChairR",7.3,-16.93,0);

  createPlant("plantFarL",-9.25,-15.9);
  createPlant("plantFarR",9.25,-15.9);
  createBin("binFarL",-9.0,-11.8);
  createBin("binFarR",9.0,-11.8);


  // ------------------------------------------------------------
  // Extra destructible building detail
  // ------------------------------------------------------------
  function createBreakableCeilingLight(name,x,z){
    const root=new BABYLON.TransformNode(name,scene);
    root.position.set(x,2.88,z);

    const frame=childBox(
      name+"Frame",root,new BABYLON.Vector3(),
      new BABYLON.Vector3(.80,.055,.34),
      darkTrimMat,false
    );
    const lens=childBox(
      name+"Lens",root,new BABYLON.Vector3(0,-.034,0),
      new BABYLON.Vector3(.71,.018,.27),
      lightPanelMat,false
    );

    return registerProp(root,[frame,lens],{
      type:"light",mass:.8,radius:.43,minY:.10,breakThreshold:3.4,hp:8
    });
  }

  for(const [x,z] of [
    [-2.7,-4.8],[0,-4.8],[2.7,-4.8],
    [-2.7,-7.4],[0,-7.4],[2.7,-7.4]
  ]){
    createBreakableCeilingLight("breakLight"+x+"_"+z,x,z);
  }

  // Fire alarm: destroying it activates the sprinklers.
  const alarmRoot=new BABYLON.TransformNode("fireAlarmRoot",scene);
  alarmRoot.position.set(-4.82,1.42,-5.9);
  const alarmBox=childBox(
    "fireAlarmBox",alarmRoot,new BABYLON.Vector3(),
    new BABYLON.Vector3(.08,.28,.22),
    redMat,false
  );
  const alarmButton=childBox(
    "fireAlarmButton",alarmRoot,new BABYLON.Vector3(-.045,0,0),
    new BABYLON.Vector3(.018,.10,.10),
    paperMat,false
  );
  registerProp(alarmRoot,[alarmBox,alarmButton],{
    type:"alarm",mass:.4,radius:.18,minY:1.10,breakThreshold:4.2,hp:9
  });

  // Sprinkler heads throughout both office sections.
  for(const x of [-3,0,3]){
    for(const z of [-1.5,-5.2,-7.7]){
      const root=new BABYLON.TransformNode("sprinkler"+x+"_"+z,scene);
      root.position.set(x,2.89,z);

      const stem=BABYLON.MeshBuilder.CreateCylinder("sprinklerStem",{
        height:.10,diameter:.035,tessellation:10
      },scene);
      stem.parent=root;
      stem.position.y=-.04;
      stem.material=deskMetalMat;

      const head=BABYLON.MeshBuilder.CreateCylinder("sprinklerHead",{
        height:.025,diameter:.095,tessellation:12
      },scene);
      head.parent=root;
      head.position.y=-.10;
      head.material=deskMetalMat;

      sprinklerHeads.push(root);
    }
  }

  // Extra wear/details to push the office away from flat grey primitives.
  const scuffMat=mkMat("scuffMat","#3f454a");
  scuffMat.alpha=.22;
  for(let i=0;i<28;i++){
    const scuff=BABYLON.MeshBuilder.CreateDisc("floorScuff"+i,{radius:.025+Math.random()*.07,tessellation:10},scene);
    scuff.position.set(-4.2+Math.random()*8.4,.012,-8.3+Math.random()*11.8);
    scuff.rotation.x=Math.PI/2;
    scuff.scaling.set(1.5,.45,1);
    scuff.material=scuffMat;
  }

  // Thin wall seams/panels for concrete/plaster depth.
  for(const z of [-8,-6,-4,-2,0,2]){
    box("wallSeamL"+z,new BABYLON.Vector3(-4.885,1.45,z),new BABYLON.Vector3(.012,2.72,.025),darkTrimMat,false);
    box("wallSeamR"+z,new BABYLON.Vector3(4.885,1.45,z),new BABYLON.Vector3(.012,2.72,.025),darkTrimMat,false);
  }

  function surfaceSphereHit(surface,center,radius){
    if(!surface || surface.isDisposed?.() || !surface.isEnabled()) return null;

    surface.computeWorldMatrix(true);
    const bb=surface.getBoundingInfo().boundingBox;
    const min=bb.minimumWorld,max=bb.maximumWorld;

    const q=new BABYLON.Vector3(
      Math.max(min.x,Math.min(max.x,center.x)),
      Math.max(min.y,Math.min(max.y,center.y)),
      Math.max(min.z,Math.min(max.z,center.z))
    );

    let dv=center.subtract(q);
    let d=dv.length();
    if(d>=radius) return null;

    let normal;
    if(d>.0001){
      normal=dv.scale(1/d);
    }else{
      const faces=[
        {v:Math.abs(center.x-min.x),n:new BABYLON.Vector3(-1,0,0)},
        {v:Math.abs(max.x-center.x),n:new BABYLON.Vector3(1,0,0)},
        {v:Math.abs(center.y-min.y),n:new BABYLON.Vector3(0,-1,0)},
        {v:Math.abs(max.y-center.y),n:new BABYLON.Vector3(0,1,0)},
        {v:Math.abs(center.z-min.z),n:new BABYLON.Vector3(0,0,-1)},
        {v:Math.abs(max.z-center.z),n:new BABYLON.Vector3(0,0,1)}
      ].sort((a,b)=>a.v-b.v);
      normal=faces[0].n;
      d=0;
    }

    return {
      mesh:surface,
      point:q,
      normal,
      correction:normal.scale(radius-d+.003)
    };
  }

  function findSurfaceCollision(center,radius){
    let best=null,bestLen=0;
    for(const s of collisionSurfaces){
      const h=surfaceSphereHit(s,center,radius);
      if(!h) continue;
      const l=h.correction.length();
      if(l>bestLen){best=h;bestLen=l;}
    }
    return best;
  }

  function createBloodSplat(hit,scale=1){
    if(!hit?.mesh || !hit.point || !hit.normal) return;

    const splat=BABYLON.MeshBuilder.CreateDisc("bloodSplat",{
      radius:(.045+Math.random()*.095)*scale,
      tessellation:14,
      sideOrientation:BABYLON.Mesh.DOUBLESIDE
    },scene);

    splat.position=hit.point.add(hit.normal.scale(.007));
    splat.material=Math.random()<.35?bloodBrightMat:bloodMat;
    splat.lookAt(splat.position.add(hit.normal));
    splat.rotation.z=Math.random()*Math.PI*2;
    splat.isPickable=false;

    bloodSplats.push(splat);
    while(bloodSplats.length>PERF.maxBloodSplats){
      const old=bloodSplats.shift();
      old?.dispose();
    }
  }

  function spawnBloodExplosion(origin,hitDir,strength=1){
    // Crazy Office has no blood.
    return;
  }

  function spawnGlassBurst(pos,velocity,count=18){
    const v=velocity?.clone()||new BABYLON.Vector3();
    if(v.lengthSquared()<.001) v.set(0,0,2);

    for(let i=0;i<count;i++){
      const sh=BABYLON.MeshBuilder.CreateBox("glassShard",{
        width:.035+Math.random()*.065,
        height:.035+Math.random()*.10,
        depth:.008+Math.random()*.012
      },scene);
      sh.position=pos.add(new BABYLON.Vector3(
        (Math.random()-.5)*.35,
        (Math.random()-.5)*.50,
        (Math.random()-.5)*.05
      ));
      sh.material=glassMat;

      const dir=v.normalize().scale(.9+Math.random()*2.0);
      fxBodies.push({
        mesh:sh,
        kind:"glass",
        radius:.045,
        vel:dir.add(new BABYLON.Vector3(
          (Math.random()-.5)*2.0,
          .5+Math.random()*2.3,
          (Math.random()-.5)*2.0
        )),
        spin:new BABYLON.Vector3(
          (Math.random()-.5)*12,
          (Math.random()-.5)*12,
          (Math.random()-.5)*12
        ),
        life:2.2+Math.random()*1.2
      });
    }
    trimFxBodies();
  }

  function breakWindow(mesh,hitPos,velocity){
    if(!mesh?.metadata?.breakableWindow || mesh.metadata.broken) return false;

    mesh.metadata.broken=true;
    mesh.metadata.respawnTimer=30;
    removeCollision(mesh);
    mesh.setEnabled(false);

    spawnGlassBurst(
      hitPos||mesh.getAbsolutePosition(),
      velocity||new BABYLON.Vector3(0,0,2),
      24
    );
    playImpactSound("glass",1.0);
    recordDestruction();
    return true;
  }

  function breakMonitor(prop,hitPos,velocity){
    if(prop.screen && !prop.screen.isEnabled()) return;

    if(prop.screen) prop.screen.setEnabled(false);
    spawnGlassBurst(hitPos,velocity,12);

    // small electrical flash
    const flashMat=mkMat("monitorFlash"+Math.random(),"#b9efff");
    flashMat.emissiveColor=new BABYLON.Color3(.6,.9,1);
    for(let i=0;i<6;i++){
      const s=BABYLON.MeshBuilder.CreateSphere("monitorSpark",{diameter:.025,segments:5},scene);
      s.position.copyFrom(hitPos);
      s.material=flashMat;
      fxBodies.push({
        mesh:s,kind:"spark",radius:.012,
        vel:new BABYLON.Vector3(
          (Math.random()-.5)*2.8,
          .8+Math.random()*2.0,
          (Math.random()-.5)*2.8
        ),
        spin:new BABYLON.Vector3(),
        life:.35+Math.random()*.35
      });
    }
  }

  function segmentHitsMesh(a,b,mesh,r=.075){
    if(!mesh || !mesh.isEnabled()) return false;
    for(let i=0;i<=6;i++){
      const t=i/6;
      const p=BABYLON.Vector3.Lerp(a,b,t);
      const q=closestPointAabb(p,mesh);
      if(BABYLON.Vector3.Distance(p,q)<=r) return true;
    }
    return false;
  }

  function spawnDebrisBox(pos,size,material,vel,life=2.8){
    const m=BABYLON.MeshBuilder.CreateBox("debris",{width:size.x,height:size.y,depth:size.z},scene);
    m.position.copyFrom(pos);m.material=material;
    fxBodies.push({
      mesh:m,kind:"debris",
      radius:Math.max(size.x,size.y,size.z)*.35,
      vel:vel.clone(),
      spin:new BABYLON.Vector3((Math.random()-.5)*9,(Math.random()-.5)*9,(Math.random()-.5)*9),
      life
    });
    trimFxBodies();
  }


  function loosenDeskContents(deskProp,dir,speed,hard=false){
    const cx=deskProp.root.position.x;
    const cz=deskProp.root.position.z;

    for(const other of officeProps){
      if(other===deskProp || other.broken) continue;
      if(!["monitor","keyboard","mouse","mousepad","mug","phone","papers","pencup","stapler","cable"].includes(other.type)) continue;

      const ox=other.root.position.x;
      const oz=other.root.position.z;
      const dx=ox-cx;
      const dz=oz-cz;

      // Close enough to be sitting on the desk surface.
      if(Math.abs(dx)<=1.22 && Math.abs(dz)<=.88 && other.root.position.y>.42){
        other.loose=true;
        other.sleepTimer=0;
        other.minY=0;

        const slide = new BABYLON.Vector3(
          dx*2.9 + dir.x*(hard ? 1.60 : .85),
          .36 + Math.min(.95, speed*.10),
          dz*2.9 + dir.z*(hard ? 1.60 : .85)
        );

        other.vel.addInPlace(slide);
        other.ang.addInPlace(new BABYLON.Vector3(
          (Math.random()-.5)*(hard ? 6.6 : 3.8),
          (Math.random()-.5)*(hard ? 4.8 : 2.6),
          (Math.random()-.5)*(hard ? 6.6 : 3.8)
        ));

        if(hard && other.type==="monitor" && !other.broken){
          breakMonitor(
            other,
            other.root.getAbsolutePosition?.()?.clone?.() || other.root.position.clone(),
            slide
          );
        }
      }
    }
  }

  function destroyDeskContents(deskProp,dir,speed){
    const cx=deskProp.root.position.x;
    const cz=deskProp.root.position.z;

    for(const other of officeProps){
      if(other===deskProp || other.broken) continue;
      if(!["monitor","keyboard","mouse","mousepad","mug","phone","papers","pencup","stapler","cable"].includes(other.type)) continue;

      const ox=other.root.position.x;
      const oz=other.root.position.z;
      const dx=Math.abs(ox-cx);
      const dz=Math.abs(oz-cz);

      // close enough to be sitting on the desk surface
      if(dx<=.95 && dz<=.58 && other.root.position.y>.78){
        destroyOfficeProp(
          other,
          other.root.position.clone(),
          dir.clone(),
          Math.max(speed*.85, other.breakThreshold*1.7)
        );
      }
    }
  }

  function destroyOfficeProp(prop,hitPos,dir,speed){
    if(!prop || prop.broken) return;

    // Direction must exist before any desk cleanup uses it.
    const d=dir?.clone?.() || new BABYLON.Vector3(0,1,0);
    if(d.lengthSquared()<.001) d.set(0,1,0);
    d.normalize();

    prop.broken=true;prop.loose=false;prop.respawnTimer=30;
    prop.hitMeshes.forEach(m=>{
      if(m){
        removeCollision(m);
        m.setEnabled?.(false);
      }
    });

    if(prop.type==="desk"){
      // Safety sweep: no hidden desk collider may remain after destruction.
      for(const s of [...collisionSurfaces]){
        if(s===prop.root || s?.parent===prop.root){
          removeCollision(s);
          s.setEnabled?.(false);
        }
      }

      // Anything resting on the desk must start falling immediately.
      loosenDeskContents(prop,d,Math.max(speed,4.0),true);
    }

    const center=prop.root.getAbsolutePosition?.()?.clone?.() || prop.root.position.clone();
    prop.root.setEnabled?.(false);
    const base=d.scale(Math.min(6,1.4+speed*.35)).add(new BABYLON.Vector3(0,.6+Math.random()*1.2,0));

    const chunk=(off,size,mat,scatter=1)=>{
      spawnDebrisBox(
        center.add(off),size,mat,
        base.add(new BABYLON.Vector3((Math.random()-.5)*scatter,Math.random()*scatter,(Math.random()-.5)*scatter)),
        2.4+Math.random()*1.4
      );
    };

    if(prop.type==="desk"){
      chunk(new BABYLON.Vector3(0,.72,0),new BABYLON.Vector3(.70,.07,.32),deskMat,1.8);
      chunk(new BABYLON.Vector3(.36,.55,.12),new BABYLON.Vector3(.28,.45,.25),deskMat,1.6);
      for(const sx of [-1,1]) chunk(new BABYLON.Vector3(sx*.52,.33,.18),new BABYLON.Vector3(.06,.60,.06),deskMetalMat,2.2);
    }else if(prop.type==="chair"){
      chunk(new BABYLON.Vector3(0,.48,0),new BABYLON.Vector3(.42,.09,.42),chairMat,2.5);
      chunk(new BABYLON.Vector3(0,.80,.18),new BABYLON.Vector3(.42,.42,.07),chairMat,2.5);
      for(let i=0;i<4;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.38,.08,(Math.random()-.5)*.38),new BABYLON.Vector3(.10,.05,.10),deskMetalMat,3);
    }else if(prop.type==="keyboard"){
      for(let i=0;i<16;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.34,.05,(Math.random()-.5)*.13),new BABYLON.Vector3(.04,.018,.038),darkTrimMat,3.5);
      chunk(new BABYLON.Vector3(),new BABYLON.Vector3(.32,.025,.12),keyboardMat,2.4);
    }else if(prop.type==="mug"){
      for(let i=0;i<8;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.10,.06+Math.random()*.08,(Math.random()-.5)*.10),new BABYLON.Vector3(.045,.035,.018),mugMat,3.2);
      playImpactSound("ceramic",1);
    }else if(prop.type==="plant"){
      for(let i=0;i<7;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.20,.10+Math.random()*.55,(Math.random()-.5)*.20),new BABYLON.Vector3(.10,.035,.07),i<3?potMat:plantMat,2.8);
    }else if(prop.type==="monitor"){
      chunk(new BABYLON.Vector3(0,.28,0),new BABYLON.Vector3(.45,.28,.05),monitorMat,2);
      chunk(new BABYLON.Vector3(0,.08,.02),new BABYLON.Vector3(.07,.23,.06),deskMetalMat,2);
      spawnGlassBurst(hitPos,d.scale(4),18);
    }else if(prop.type==="door"){
      for(let i=0;i<5;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.80,.35+Math.random()*1.55,0),new BABYLON.Vector3(.32,.48,.055),deskMat,2.2);
    }else if(prop.type==="printer" || prop.type==="cooler"){
      for(let i=0;i<6;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.35,.20+Math.random()*.45,(Math.random()-.5)*.30),new BABYLON.Vector3(.18,.15,.15),i%2?trimMat:darkTrimMat,2.4);
      if(prop.type==="printer") spawnGlassBurst(hitPos,d.scale(3),8);
    }else if(prop.type==="whiteboard"){
      for(let i=0;i<7;i++) chunk(new BABYLON.Vector3((Math.random()-.5)*.8,(Math.random()-.5)*.4,0),new BABYLON.Vector3(.28,.22,.025),i%3?boardMat:darkTrimMat,2.2);
    }else if(prop.type==="light"){
      spawnGlassBurst(hitPos,d.scale(2.8),16);
      for(let i=0;i<7;i++) chunk(
        new BABYLON.Vector3((Math.random()-.5)*.30,0,(Math.random()-.5)*.18),
        new BABYLON.Vector3(.08,.025,.06),darkTrimMat,2.8
      );
      playImpactSound("glass",1);
    }else if(prop.type==="alarm"){
      sprinklersActive=true;
      sprinklerTimer=0;
      for(let i=0;i<4;i++) chunk(
        new BABYLON.Vector3(0,(Math.random()-.5)*.12,(Math.random()-.5)*.08),
        new BABYLON.Vector3(.05,.08,.05),i%2?redMat:paperMat,2
      );
      playImpactSound("metal",.9);
    }else{
      chunk(new BABYLON.Vector3(),new BABYLON.Vector3(.20,.14,.18),darkTrimMat,2.5);
      chunk(new BABYLON.Vector3(.08,.06,.03),new BABYLON.Vector3(.14,.10,.12),trimMat,2.7);
    }

    playImpactSound(propSoundType(prop.type),1);
    if(!prop.destructionRewarded){
      prop.destructionRewarded=true;
      recordDestruction();
    }
  }

  function hitOfficeProp(prop,hitPos,swingVel,speed){
    if(prop.cooldown>0 || prop.broken) return;
    prop.cooldown=.14;prop.loose=true;prop.sleepTimer=0;

    let dir=swingVel.clone(); if(dir.lengthSquared()<.001) dir.set(0,1,0); dir.normalize();

    if(prop.type==="desk" && speed>=0.60){
      loosenDeskContents(prop,dir,Math.max(speed,2.1),true);
    }

    const power=Math.min(5,(speed*1.8)/Math.max(.55,prop.mass));

    if(prop.type==="door" && speed<prop.breakThreshold*1.5){
      const swingSign=dir.z>=0 ? 1 : -1;
      prop.root.rotation.y+=swingSign*Math.min(.42,.06+speed*.035);
      prop.loose=false;
    }else{
      prop.vel.addInPlace(dir.scale(power));
    }

    prop.vel.y+=Math.min(1.15,speed*.07);
    prop.ang.addInPlace(new BABYLON.Vector3(
      (Math.random()-.5)*power*1.7,(Math.random()-.5)*power*1.4,(Math.random()-.5)*power*1.7
    ));

    const hitDamage=Math.max(1,Math.round(.7+Math.pow(speed,1.28)*.55));
    prop.hp-=hitDamage;

    if(prop.type==="monitor" && speed>=prop.breakThreshold && !prop.broken){
      breakMonitor(prop,hitPos,swingVel);
      prop.hp=Math.min(prop.hp,1);
    }

    if(prop.hp<=0 || speed>=prop.breakThreshold*1.55){
      destroyOfficeProp(prop,hitPos,dir,speed);
    }else{
      playImpactSound(propSoundType(prop.type),Math.min(1,speed*.095));
    }

    pulse(hands.right,Math.min(.75,.12+speed*.055),28+Math.min(45,speed*3));
  }
  function handleBatOfficeHit(prev,tip,vel,speed){
    if(speed<.55) return;

    for(const w of breakableWindows){
      if(w.metadata?.broken || !w.isEnabled()) continue;
      if(segmentHitsMesh(prev,tip,w,.09)){
        if(speed>=1.35){
          breakWindow(w,tip,vel);
          pulse(hands.right,.95,90);
        }else{
          pulse(hands.right,.20,25);
        }
        return;
      }
    }

    for(const prop of officeProps){
      if(prop.cooldown>0) continue;
      const hit=prop.hitMeshes.some(m=>segmentHitsMesh(prev,tip,m,.075));
      if(hit){
        hitOfficeProp(prop,tip,vel,speed);
        return;
      }
    }
  }

  function respawnOfficeProp(p){
    if(!p || !p.broken) return;
    p.broken=false;p.loose=false;p.respawnTimer=0;p.cooldown=.25;
    p.destructionRewarded=false;
    p.hp=p.maxHp;p.vel.set(0,0,0);p.ang.set(0,0,0);p.sleepTimer=0;
    p.root.position.copyFrom(p.initialPosition);
    p.root.rotation.copyFrom(p.initialRotation);
    p.root.setEnabled(true);
    p.hitMeshes.forEach((m,i)=>{
      if(!m || m.isDisposed?.()) return;
      m.setEnabled(true);
      if(p.initialCollisions[i]) addCollision(m);
    });
    if(p.screen) p.screen.setEnabled(true);
  }

  function updateOfficePhysics(dt){
    for(const p of officeProps){
      p.cooldown=Math.max(0,p.cooldown-dt);
      if(p.broken){
        p.respawnTimer=(p.respawnTimer||30)-dt;
        if(p.respawnTimer<=0) respawnOfficeProp(p);
        continue;
      }
      if(!p.loose) continue;

      p.vel.y-=8.8*dt;

      // Clamp furniture speed / spin to stop objects exploding through the room.
      const maxPropSpeed=p.type==="monitor" ? 4.0 : p.type==="keyboard" ? 5.0 : 5.8;
      if(p.vel.length()>maxPropSpeed){
        p.vel.normalize().scaleInPlace(maxPropSpeed);
      }

      p.ang.x=BABYLON.Scalar.Clamp(p.ang.x,-4.0,4.0);
      p.ang.y=BABYLON.Scalar.Clamp(p.ang.y,-4.0,4.0);
      p.ang.z=BABYLON.Scalar.Clamp(p.ang.z,-4.0,4.0);

      p.root.position.addInPlace(p.vel.scale(dt));
      p.root.rotation.x+=p.ang.x*dt;
      p.root.rotation.y+=p.ang.y*dt;
      p.root.rotation.z+=p.ang.z*dt;

      p.vel.x*=Math.pow(.30,dt);
      p.vel.z*=Math.pow(.30,dt);
      p.ang.scaleInPlace(Math.pow(.16,dt));

      if(p.root.position.y<p.minY){
        p.root.position.y=p.minY;
        if(p.vel.y<0) p.vel.y*=-.10;
        p.vel.x*=.76;p.vel.z*=.76;
      }

      const motion=p.vel.length()+p.ang.length()*.08;
      if(motion<PERF.propSleepSpeed && p.root.position.y<=p.minY+.015){
        p.sleepTimer+=dt;
        if(p.sleepTimer>PERF.propSleepSeconds){
          p.loose=false;p.vel.set(0,0,0);p.ang.set(0,0,0);
        }
      }else p.sleepTimer=0;
    }

    for(const w of breakableWindows){
      if(!w.metadata?.broken) continue;
      w.metadata.respawnTimer=(w.metadata.respawnTimer??30)-dt;
      if(w.metadata.respawnTimer<=0){
        w.metadata.broken=false;w.metadata.respawnTimer=0;w.setEnabled(true);addCollision(w);
      }
    }

    if(sprinklersActive && sprinklerHeads.length){
      sprinklerTimer-=dt;

      if(sprinklerTimer<=0){
        sprinklerTimer=.055;

        // Small bounded water effect for Quest performance.
        for(let n=0;n<2;n++){
          const h=sprinklerHeads[Math.floor(Math.random()*sprinklerHeads.length)];
          const drop=BABYLON.MeshBuilder.CreateSphere("waterDrop",{
            diameter:.022,segments:5
          },scene);

          drop.position=h.getAbsolutePosition().add(new BABYLON.Vector3(
            (Math.random()-.5)*.20,
            -.13,
            (Math.random()-.5)*.20
          ));
          drop.material=bottleMat;

          fxBodies.push({
            mesh:drop,
            kind:"water",
            radius:.012,
            vel:new BABYLON.Vector3(
              (Math.random()-.5)*.8,
              -1.2-Math.random()*1.4,
              (Math.random()-.5)*.8
            ),
            spin:new BABYLON.Vector3(),
            life:1.6
          });
        }
      }
    }

    trimFxBodies();

    for(let i=fxBodies.length-1;i>=0;i--){
      const f=fxBodies[i];
      f.life-=dt;f.vel.y-=7.4*dt;f.mesh.position.addInPlace(f.vel.scale(dt));
      if(f.spin){
        f.mesh.rotation.x+=f.spin.x*dt;f.mesh.rotation.y+=f.spin.y*dt;f.mesh.rotation.z+=f.spin.z*dt;
      }
      const hit=findSurfaceCollision(f.mesh.position,f.radius||.02);
      if(hit){
        if(f.kind==="blood"){
          createBloodSplat(hit,.7+Math.random()*.75);
          f.mesh.dispose();fxBodies.splice(i,1);continue;
        }
        if(f.kind==="water"){
          f.mesh.dispose();fxBodies.splice(i,1);continue;
        }
        f.mesh.position.addInPlace(hit.correction);
        const vn=BABYLON.Vector3.Dot(f.vel,hit.normal);
        if(vn<0) f.vel.subtractInPlace(hit.normal.scale(vn*1.30));
        f.vel.scaleInPlace(f.kind==="glass"?.46:.32);
      }
      if(f.life<=0 || f.mesh.position.y<-5.2){
        f.mesh.dispose();fxBodies.splice(i,1);
      }
    }
  }

  const previewCamera = new BABYLON.UniversalCamera("preview",new BABYLON.Vector3(0,1.65,-3.15),scene);
  previewCamera.setTarget(new BABYLON.Vector3(0,1.25,.7));
  previewCamera.minZ=.04;
  previewCamera.speed=.20;
  previewCamera.angularSensibility=3200;
  scene.activeCamera=previewCamera;
  previewCamera.attachControl(canvas,true);

  let testAIEnabled=false;

  function isInXR(){
    return !!(xr && xr.baseExperience?.state===BABYLON.WebXRState.IN_XR);
  }

  function playerWorldPos(){
    if(xrCamera && isInXR()) return xrCamera.globalPosition.clone();
    return previewCamera.globalPosition?.clone?.() || previewCamera.position.clone();
  }

  // ------------------------------------------------------------
  // Economy / collection / map progression. NO PLAYER LEVEL.
  // ------------------------------------------------------------
  const SAVE_KEY="vrBatBrawl_v025";
  const todayKey=()=>new Date().toISOString().slice(0,10);
  const weekKey=()=>{const d=new Date(),x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return `${x.getUTCFullYear()}-W${String(Math.ceil((((x-y)/86400000)+1)/7)).padStart(2,"0")}`;};
  const RARITIES=["Common","Uncommon","Rare","Epic","Legendary","Mythic"];
  const FIXED_ODDS=[["Common",.55],["Uncommon",.25],["Rare",.12],["Epic",.05],["Legendary",.025],["Mythic",.005]]; // no pity
  const REFUND={Common:[60,1],Uncommon:[120,2],Rare:[260,5],Epic:[600,12],Legendary:[1500,28],Mythic:[4200,70]};

  const BAT_CATALOG=[
    {id:"office",name:"Office Basher",rarity:"Common",ability:"Impact",color:"#9b6136"},
    {id:"heavy",name:"Heavy Bat",rarity:"Uncommon",ability:"Heavy Stun",color:"#515963"},
    {id:"wind",name:"Wind Bat",rarity:"Rare",ability:"Wind Knockback",color:"#69d2cf"},
    {id:"ice",name:"Ice Bat",rarity:"Rare",ability:"Freeze Slow",color:"#7fd8ff"},
    {id:"poison",name:"Poison Bat",rarity:"Epic",ability:"Poison Damage",color:"#65b64e"},
    {id:"magnet",name:"Magnet Bat",rarity:"Epic",ability:"Magnetic Pull",color:"#b267ce"},
    {id:"ceo",name:"CEO Crusher",rarity:"Epic",ability:"Power Slam",color:"#202936",boss:"office"},
    {id:"ruler",name:"Principal's Ruler",rarity:"Epic",ability:"Discipline Shock",color:"#d59c54",boss:"school"},
    {id:"shock",name:"Shock Baton",rarity:"Legendary",ability:"Chain Shock",color:"#f0cc3c",boss:"hospital"},
    {id:"industrial",name:"Industrial Hammer",rarity:"Legendary",ability:"Ground Impact",color:"#d6772a",boss:"factory"},
    {id:"captain",name:"Captain's Bat",rarity:"Legendary",ability:"Tidal Launch",color:"#75462c",boss:"pirate"},
    {id:"lava",name:"Lava Mythic Bat",rarity:"Mythic",ability:"Lava Burn",color:"#e55224",boss:"volcano"},
    {id:"ghost",name:"Ghost Bat",rarity:"Mythic",ability:"Phase Hit",color:"#d9e7ff"},
    {id:"gravity",name:"Gravity Bat",rarity:"Mythic",ability:"Gravity Lift",color:"#7154e4",boss:"space"},
    {id:"alien",name:"Alien Bat",rarity:"Mythic",ability:"Alien Pulse",color:"#71df73",boss:"alien"}
  ];
  const SKIN_CATALOG=[
    {id:"classic",name:"Classic Potato",rarity:"Common",color:"#a97848"},
    {id:"russet",name:"Russet Potato",rarity:"Common",color:"#895a35"},
    {id:"sweet",name:"Sweet Potato",rarity:"Uncommon",color:"#c56d43"},
    {id:"officeSkin",name:"Office Potato",rarity:"Uncommon",color:"#b28a55"},
    {id:"frost",name:"Frost Potato",rarity:"Rare",color:"#8bbdcc"},
    {id:"pirateSkin",name:"Pirate Potato",rarity:"Rare",color:"#8a664e"},
    {id:"toxic",name:"Toxic Potato",rarity:"Epic",color:"#73a84e"},
    {id:"neon",name:"Neon Potato",rarity:"Epic",color:"#b85bd6"},
    {id:"lavaSkin",name:"Lava Potato",rarity:"Legendary",color:"#c94e2e"},
    {id:"gold",name:"Golden Potato",rarity:"Legendary",color:"#d5ad3f"},
    {id:"spaceSkin",name:"Space Potato",rarity:"Legendary",color:"#66758e"},
    {id:"void",name:"Void Potato",rarity:"Mythic",color:"#514077"},
    {id:"alienSkin",name:"Alien Potato",rarity:"Mythic",color:"#59b965"}
  ];
  const MAP_CATALOG=[
    {id:"office",name:"Office",rarity:"Common"},{id:"school",name:"School",rarity:"Common"},{id:"house",name:"House",rarity:"Common"},
    {id:"supermarket",name:"Supermarket",rarity:"Uncommon"},{id:"gym",name:"Gym",rarity:"Uncommon"},{id:"hotel",name:"Hotel",rarity:"Uncommon"},{id:"bank",name:"Bank",rarity:"Uncommon"},
    {id:"metro",name:"Metro",rarity:"Rare"},{id:"factory",name:"Factory",rarity:"Rare"},{id:"cinema",name:"Cinema",rarity:"Rare"},{id:"arcade",name:"Arcade",rarity:"Rare"},{id:"city",name:"City",rarity:"Rare"},
    {id:"forest",name:"Forest",rarity:"Epic"},{id:"beach",name:"Beach",rarity:"Epic"},{id:"construction",name:"Construction",rarity:"Epic"},{id:"mall",name:"Mall",rarity:"Epic"},{id:"police",name:"Police Station",rarity:"Epic"},{id:"hospital",name:"Hospital",rarity:"Epic"},
    {id:"lab",name:"Laboratory",rarity:"Legendary"},{id:"stadium",name:"Stadium",rarity:"Legendary"},{id:"castle",name:"Castle",rarity:"Legendary"},{id:"farm",name:"Farm",rarity:"Legendary"},{id:"pirate",name:"Pirate Ship",rarity:"Legendary"},{id:"amusement",name:"Amusement Park",rarity:"Legendary"},
    {id:"volcano",name:"Volcano",rarity:"Mythic"},{id:"space",name:"Space Station",rarity:"Mythic"},{id:"alien",name:"Alien Planet",rarity:"Mythic"}
  ];

  // Gorilla Tag-style potato color mixer:
  // three channels (R/G/B), each from 0–9.
  function rgbDigitTo255(v){
    return Math.round(BABYLON.Scalar.Clamp(Number(v)||0,0,9)/9*255);
  }
  function potatoRgbHex(rgb){
    const r=rgbDigitTo255(rgb?.r),g=rgbDigitTo255(rgb?.g),b=rgbDigitTo255(rgb?.b);
    return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
  }

  const COSMETIC_CATALOG=[
    {id:"capRed",name:"Red Cap",slot:"head",type:"gem",price:35,rarity:"Common"},
    {id:"capBlue",name:"Blue Cap",slot:"head",type:"gem",price:35,rarity:"Common"},
    {id:"sunglasses",name:"Cool Shades",slot:"face",type:"gem",price:55,rarity:"Rare"},
    {id:"headphones",name:"DJ Headphones",slot:"head",type:"gem",price:80,rarity:"Epic"},
    {id:"crown",name:"Golden Crown",slot:"head",type:"gem",price:120,rarity:"Legendary"},
    {id:"backpack",name:"Mini Backpack",slot:"back",type:"gem",price:65,rarity:"Rare"},
    {id:"angelHalo",name:"Angel Halo",slot:"head",type:"premium",price:"€1.99",rarity:"Legendary"},
    {id:"voidCrown",name:"Void Crown",slot:"head",type:"premium",price:"€2.99",rarity:"Mythic"},
    {id:"pixelShades",name:"Pixel Shades",slot:"face",type:"premium",price:"€1.49",rarity:"Epic"},
    {id:"goldChain",name:"Gold Chain",slot:"chest",type:"premium",price:"€1.99",rarity:"Legendary"},
    {id:"ownerCrown",name:"Founder Reactor Crown",slot:"head",type:"owner",price:"OWNER GIFT",rarity:"OWNER"},
    {id:"ownerVisor",name:"Glitchwave Visor",slot:"face",type:"owner",price:"OWNER GIFT",rarity:"OWNER"},
    {id:"ownerCore",name:"Neon Owner Core",slot:"chest",type:"owner",price:"OWNER GIFT",rarity:"OWNER"},
    {id:"ownerCape",name:"Zero-G Founder Cape",slot:"back",type:"owner",price:"OWNER GIFT",rarity:"OWNER"}
  ];
  const OWNER_COSMETIC_IDS=["ownerCrown","ownerVisor","ownerCore","ownerCape"];

  const BUNDLES=[
    {id:"lava_bundle",name:"Lava Bundle",price:"€4.99",sku:"crazyoffice.bundle.lava",bat:"lava",skin:"lavaSkin",coins:3000,gems:120},
    {id:"storm_bundle",name:"Storm Bundle",price:"€4.99",sku:"crazyoffice.bundle.storm",bat:"shock",skin:"frost",coins:3000,gems:120},
    {id:"ghost_bundle",name:"Ghost Bundle",price:"€4.99",sku:"crazyoffice.bundle.ghost",bat:"ghost",skin:"void",coins:3000,gems:120},
    {id:"space_bundle",name:"Space Bundle",price:"€4.99",sku:"crazyoffice.bundle.space",bat:"gravity",skin:"spaceSkin",coins:3000,gems:120},
    {id:"halo_bundle",name:"Skybreaker Bundle",price:"€8.00",sku:"crazyoffice.bundle.skybreaker",bat:"wind",skin:"frost",cosmetic:"angelHalo",coins:5000,gems:250},
    {id:"pixel_bundle",name:"Arcade King Bundle",price:"€8.00",sku:"crazyoffice.bundle.arcadeking",bat:"shock",skin:"gold",cosmetic:"pixelShades",coins:5000,gems:250},
    {id:"chain_bundle",name:"Golden Boss Bundle",price:"€8.00",sku:"crazyoffice.bundle.goldenboss",bat:"heavy",skin:"gold",cosmetic:"goldChain",coins:6000,gems:300}
  ];

  const GEM_PACKS=[
    {id:"gems100",name:"Pocket Gems",gems:100,price:"€0.99",sku:"crazyoffice.gems.100"},
    {id:"gems550",name:"Gem Stack",gems:550,price:"€4.99",sku:"crazyoffice.gems.550"},
    {id:"gems1200",name:"Gem Vault",gems:1200,price:"€9.99",sku:"crazyoffice.gems.1200"},
    {id:"gems2600",name:"Mega Gem Vault",gems:2600,price:"€19.99",sku:"crazyoffice.gems.2600"}
  ];
  const freshMapProgress=()=>Object.fromEntries(MAP_CATALOG.map(m=>[m.id,{level:1,waveKills:0,bossWins:0}]));
  const OWNER_STORAGE_KEY="crazyOffice_owner_access_v2";
  const OWNER_KEY_HASH="ee79e173c3b1deb1e6c93fd485bd803e18ee5139c3fdaa1d829a6fd4846112f7";
  let OWNER_ACCESS=(()=>{try{return localStorage.getItem(OWNER_STORAGE_KEY)==="1";}catch(_){return false;}})();

  async function verifyOwnerKeyFromUrl(){
    try{
      const params=new URLSearchParams(location.search);
      const key=params.get("ownerKey");
      if(!key||OWNER_ACCESS)return;
      const data=new TextEncoder().encode(key);
      const digest=await crypto.subtle.digest("SHA-256",data);
      const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
      if(hex===OWNER_KEY_HASH){
        localStorage.setItem(OWNER_STORAGE_KEY,"1");
        params.delete("ownerKey");
        const qs=params.toString();
        history.replaceState(null,"",location.pathname+(qs?"?"+qs:"")+location.hash);
        location.reload();
      }
    }catch(_){}
  }
  verifyOwnerKeyFromUrl();

  let gameState={coins:500,gems:15,kills:0,destroyed:0,blocks:0,selectedBat:"office",selectedSkin:"classic",selectedMap:"office",mode:"NORMAL",bats:{office:{count:1,level:1,xp:0}},skins:{classic:1},maps:{office:1},mapProgress:freshMapProgress(),crateHistory:[],tradeHistory:[],pendingDuplicate:null,duplicateQueue:[],dailyDate:todayKey(),daily:{kill:{goal:3,progress:0,coins:80,gems:1,claimed:false},destroy:{goal:8,progress:0,coins:70,gems:1,claimed:false},block:{goal:4,progress:0,coins:70,gems:1,claimed:false}},weeklyDate:weekKey(),weekly:{boss:{goal:3,progress:0,gems:12,claimed:false}},settings:{
      batHand:"right",dominantHand:"right",menuHand:"left",previewSpin:true,npcDifficulty:"NORMAL",handReach:1.00,holsterEnabled:true,testMode:false,
      musicVolume:.50,chatVolume:.80,sfxVolume:.75,
      cameraMode:"FOLLOW",cameraDistance:1.8,cameraHeight:.35,cameraSmooth:.18,
      cameraFov:72,cameraHud:true,cameraShake:true,cameraAspect:"16:9",
      hapticStrength:.85,leftHanded:false,performanceMode:"PERFORMANCE",
      comfortVignette:false,smoothTurn:true
    },
    favorites:[],
    loadouts:["office",null,null],
    partySize:1,
    privateMatch:{friendlyFire:false,enemyCount:1,difficulty:"NORMAL",endless:false},
    tutorialSeen:false,
    potatoRGB:{r:6,g:3,b:1},
    cosmetics:{},
    equippedCosmetics:{head:null,face:null,chest:null,back:null},
    collectionStats:{rareEnemies:0,miniBosses:0,bosses:0}
  };
  const batXpNeeded=l=>45+l*22;
  const selectedBatData=()=>BAT_CATALOG.find(b=>b.id===gameState.selectedBat)||BAT_CATALOG[0];
  function selectedBatState(){return gameState.bats[gameState.selectedBat]||(gameState.bats[gameState.selectedBat]={count:1,level:1,xp:0});}
  function addBatXP(n){const s=selectedBatState();if(s.level>=50)return;s.xp+=Math.max(0,Math.round(n));while(s.level<50&&s.xp>=batXpNeeded(s.level)){s.xp-=batXpNeeded(s.level);s.level++;}if(s.level>=50)s.xp=0;saveGame();}

  function applyPerformanceMode(){
    if(gameState.settings.performanceMode==="PERFORMANCE"){
      engine.setHardwareScalingLevel(1.20);
      if(mirrorTex)mirrorTex.refreshRate=2;
    }else{
      engine.setHardwareScalingLevel(1.0);
      if(mirrorTex)mirrorTex.refreshRate=1;
    }
  }
  function updateStatsUI(){const e=document.getElementById("gameStats");if(!e)return;const b=selectedBatData(),s=selectedBatState(),p=gameState.mapProgress[gameState.selectedMap]||{level:1};e.innerHTML=`<b>${b.name} Lv.${s.level}</b><br>🪙 ${gameState.coins} &nbsp; 💎 ${gameState.gems}<br>${gameState.selectedMap.toUpperCase()} • LV ${p.level}/10 • ${gameState.mode}<br>KOs ${gameState.kills} &nbsp; Broken ${gameState.destroyed}`;}
  function saveGame(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(gameState));}catch(_){}updateStatsUI();}
  let legacyPotatoColorToMigrate=null;
  function loadGame(){try{const o=JSON.parse(localStorage.getItem("vrBatBrawl_v018")||"null");if(o){gameState.coins=Math.max(gameState.coins,o.coins||0);gameState.kills=o.kills||0;gameState.destroyed=o.destroyed||0;gameState.blocks=o.blocks||0;}const r=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(r){if(!r.potatoRGB&&r.potatoColor)legacyPotatoColorToMigrate=r.potatoColor;gameState={...gameState,...r,bats:{...gameState.bats,...(r.bats||{})},skins:{...gameState.skins,...(r.skins||{})},maps:{...gameState.maps,...(r.maps||{})},mapProgress:{...freshMapProgress(),...(r.mapProgress||{})},daily:{...gameState.daily,...(r.daily||{})},weekly:{...gameState.weekly,...(r.weekly||{})},duplicateQueue:Array.isArray(r.duplicateQueue)?r.duplicateQueue:[],settings:{...gameState.settings,...(r.settings||{})},
      favorites:Array.isArray(r.favorites)?r.favorites:[],
      loadouts:Array.isArray(r.loadouts)?r.loadouts:["office",null,null],
      privateMatch:{...gameState.privateMatch,...(r.privateMatch||{})},
      potatoRGB:{...gameState.potatoRGB,...(r.potatoRGB||{})},
      cosmetics:{...gameState.cosmetics,...(r.cosmetics||{})},
      equippedCosmetics:{...gameState.equippedCosmetics,...(r.equippedCosmetics||{})},
      collectionStats:{...gameState.collectionStats,...(r.collectionStats||{})}
    };}}catch(_){}if(gameState.dailyDate!==todayKey()){gameState.dailyDate=todayKey();gameState.daily={kill:{goal:3,progress:0,coins:80,gems:1,claimed:false},destroy:{goal:8,progress:0,coins:70,gems:1,claimed:false},block:{goal:4,progress:0,coins:70,gems:1,claimed:false}};}if(gameState.weeklyDate!==weekKey()){gameState.weeklyDate=weekKey();gameState.weekly={boss:{goal:3,progress:0,gems:12,claimed:false}};}saveGame();}
  function progressDaily(k,n=1){const d=gameState.daily[k];if(!d)return;d.progress=Math.min(d.goal,d.progress+n);if(d.progress>=d.goal&&!d.claimed){d.claimed=true;gameState.coins+=d.coins;gameState.gems+=d.gems;}saveGame();}
  const currentMapProgress=()=>gameState.mapProgress[gameState.selectedMap]||(gameState.mapProgress[gameState.selectedMap]={level:1,waveKills:0,bossWins:0});
  function recordKill(){runStats.kills++;gameState.kills++;gameState.coins+=18;addBatXP(26);const p=currentMapProgress();p.waveKills++;if(p.level>=10){p.bossWins++;gameState.weekly.boss.progress=Math.min(3,gameState.weekly.boss.progress+1);gameState.coins+=gameState.mode==="HARDCORE"?330:gameState.mode==="ENDLESS"?290:220;gameState.gems+=gameState.mode==="HARDCORE"?7:gameState.mode==="ENDLESS"?6:4;const bossBat=BAT_CATALOG.find(b=>b.boss===gameState.selectedMap);if(bossBat&&Math.random()<.12)awardItem("bat",bossBat.id,false);lastLobbyMessage=endRunSummary(true);gameState.collectionStats.bosses++;
      p.level=gameState.mode==="ENDLESS"?10:1;p.waveKills=0;setMusicMode("normal");}else if(p.waveKills>=3){p.waveKills=0;p.level=Math.min(10,p.level+1);gameState.coins+=gameState.mode==="HARDCORE"?70:gameState.mode==="SURVIVAL"?55:45;if(p.level===10)gameState.gems+=2;}if(gameState.weekly.boss.progress>=3&&!gameState.weekly.boss.claimed){gameState.weekly.boss.claimed=true;gameState.gems+=gameState.weekly.boss.gems;}progressDaily("kill");saveGame();}
  function recordDestruction(){gameState.destroyed++;gameState.coins+=3;progressDaily("destroy");saveGame();}
  function recordBlock(){runStats.blocks++;gameState.blocks++;gameState.coins++;addBatXP(2);progressDaily("block");saveGame();}
  function missionShort(){const d=gameState.daily;return `KO ${d.kill.progress}/${d.kill.goal} • BREAK ${d.destroy.progress}/${d.destroy.goal} • BLOCK ${d.block.progress}/${d.block.goal}`;}
  function rollRarity(odds=FIXED_ODDS){let r=Math.random(),a=0;for(const [rarity,chance] of odds){a+=chance;if(r<=a)return rarity;}return "Mythic";}
  function randomByRarity(c,r){const a=c.filter(x=>x.rarity===r);return a[Math.floor(Math.random()*a.length)]||c[0];}
  function awardItem(type,id,forceKeep=false){const cat=type==="bat"?BAT_CATALOG:type==="skin"?SKIN_CATALOG:MAP_CATALOG,item=cat.find(x=>x.id===id);if(!item)return null;const store=type==="bat"?gameState.bats:type==="skin"?gameState.skins:gameState.maps,owned=!!store[id];if(owned&&!forceKeep){const dup={type,id,name:item.name,rarity:item.rarity};if(gameState.pendingDuplicate)gameState.duplicateQueue.push(dup);else gameState.pendingDuplicate=dup;saveGame();return {item,duplicate:true};}if(type==="bat"){if(!store[id])store[id]={count:0,level:1,xp:0};store[id].count++;}else store[id]=(store[id]||0)+1;saveGame();return {item,duplicate:owned};}
  function resolveDuplicate(mode){const d=gameState.pendingDuplicate;if(!d)return;if(mode==="keep")awardItem(d.type,d.id,true);else{const [c,g]=REFUND[d.rarity]||REFUND.Common;if(mode==="coins")gameState.coins+=c;if(mode==="gems")gameState.gems+=g;}gameState.pendingDuplicate=null;if(gameState.duplicateQueue?.length)gameState.pendingDuplicate=gameState.duplicateQueue.shift();saveGame();}
  function openCrate(type){if(gameState.pendingDuplicate)return {error:"CHOOSE DUPLICATE FIRST"};const costs={bat:[750,0],skin:[650,0],map:[1200,0],gem:[0,80]},cost=costs[type];if(!cost||gameState.coins<cost[0]||gameState.gems<cost[1])return {error:"NOT ENOUGH CURRENCY"};gameState.coins-=cost[0];gameState.gems-=cost[1];const gemOdds=[["Common",.10],["Uncommon",.18],["Rare",.26],["Epic",.24],["Legendary",.17],["Mythic",.05]],rarity=rollRarity(type==="gem"?gemOdds:FIXED_ODDS);let t=type;if(type==="gem")t=["bat","skin","map"][Math.floor(Math.random()*3)];const cat=t==="bat"?BAT_CATALOG:t==="skin"?SKIN_CATALOG:MAP_CATALOG,item=randomByRarity(cat,rarity),res=awardItem(t,item.id,false);gameState.crateHistory.unshift({type:t,name:item.name,rarity:item.rarity,time:Date.now()});gameState.crateHistory=gameState.crateHistory.slice(0,20);saveGame();return res||{item};}
  const ownedBatIds=()=>BAT_CATALOG.filter(b=>gameState.bats[b.id]?.count>0).map(b=>b.id);
  const ownedSkinIds=()=>SKIN_CATALOG.filter(s=>gameState.skins[s.id]>0).map(s=>s.id);
  const ownedMapIds=()=>MAP_CATALOG.filter(m=>gameState.maps[m.id]>0).map(m=>m.id);

  function applyOwnerAccess(){
    if(!OWNER_ACCESS)return;
    gameState.coins=Math.max(gameState.coins||0,999999);
    gameState.gems=Math.max(gameState.gems||0,999999);

    gameState.bats=gameState.bats||{};
    for(const b of BAT_CATALOG){
      const s=gameState.bats[b.id]||{};
      s.count=Math.max(1,s.count||0);s.level=50;s.xp=0;s.locked=false;
      gameState.bats[b.id]=s;
    }

    gameState.skins=gameState.skins||{};
    for(const s of SKIN_CATALOG)gameState.skins[s.id]=Math.max(1,gameState.skins[s.id]||0);

    gameState.maps=gameState.maps||{};
    gameState.mapProgress=gameState.mapProgress||{};
    for(const m of MAP_CATALOG){
      gameState.maps[m.id]=Math.max(1,gameState.maps[m.id]||0);
      const p=gameState.mapProgress[m.id]||{level:1,waveKills:0,bossWins:0};
      p.unlocked=true;
      gameState.mapProgress[m.id]=p;
    }

    gameState.cosmetics=gameState.cosmetics||{};
    for(const c of COSMETIC_CATALOG)gameState.cosmetics[c.id]=true;

    // Owner access is local only; this flag is never sent in pose/lobby packets.
    gameState.settings.testMode=false;
  }

  loadGame();
  applyOwnerAccess();
  if(OWNER_ACCESS)saveGame();
  if(!gameState.bats?.[gameState.selectedBat]) gameState.selectedBat="office";
  if(!gameState.skins?.[gameState.selectedSkin]) gameState.selectedSkin="classic";
  if(!gameState.maps?.[gameState.selectedMap]) gameState.selectedMap="office";
  if(!Array.isArray(gameState.duplicateQueue)) gameState.duplicateQueue=[];
  gameState.duplicateQueue=gameState.duplicateQueue.slice(0,50);
  gameState.coins=Math.max(0,Number.isFinite(gameState.coins)?Math.floor(gameState.coins):500);
  gameState.gems=Math.max(0,Number.isFinite(gameState.gems)?Math.floor(gameState.gems):15);
  gameState.settings=gameState.settings||{musicVolume:.50,chatVolume:.80,sfxVolume:.75};
  for(const k of ["musicVolume","chatVolume","sfxVolume"]){
    const fallback=k==="musicVolume"?.50:k==="chatVolume"?.80:.75;
    const v=Number(gameState.settings[k]);
    gameState.settings[k]=Math.max(0,Math.min(1,Number.isFinite(v)?v:fallback));
  }
  const camModes=["1ST","2ND","3RD","FOLLOW","SELFIE","BOSS","FREE"];
  if(!camModes.includes(gameState.settings.cameraMode))gameState.settings.cameraMode="FOLLOW";
  gameState.settings.cameraDistance=Math.max(.6,Math.min(5,Number(gameState.settings.cameraDistance)||1.8));
  gameState.settings.cameraHeight=Math.max(-.5,Math.min(2,Number(gameState.settings.cameraHeight)||.35));
  gameState.settings.cameraSmooth=Math.max(.02,Math.min(.8,Number(gameState.settings.cameraSmooth)||.18));
  gameState.settings.cameraFov=Math.max(45,Math.min(110,Number(gameState.settings.cameraFov)||72));
  if(!["16:9","9:16","1:1"].includes(gameState.settings.cameraAspect))gameState.settings.cameraAspect="16:9";
  {const hv=Number(gameState.settings.hapticStrength);gameState.settings.hapticStrength=Math.max(0,Math.min(1,Number.isFinite(hv)?hv:.85));}
  if(!["PERFORMANCE","QUALITY"].includes(gameState.settings.performanceMode))gameState.settings.performanceMode="PERFORMANCE";
  // Network sessions do not survive a page reload: always boot as solo.
  gameState.partySize=1;
  {
    const legacy={
      classicBrown:{r:6,g:3,b:1},goldenTan:{r:8,g:6,b:3},rose:{r:8,g:4,b:5},mint:{r:4,g:7,b:6},
      iceBlue:{r:4,g:6,b:8},violet:{r:6,g:4,b:8},charcoal:{r:3,g:3,b:3},neonLime:{r:5,g:9,b:3},
      sunset:{r:9,g:4,b:2},royal:{r:4,g:2,b:8}
    };
    if(legacyPotatoColorToMigrate)gameState.potatoRGB=legacy[legacyPotatoColorToMigrate]||{r:6,g:3,b:1};
    else if(!gameState.potatoRGB||typeof gameState.potatoRGB!=="object")gameState.potatoRGB={r:6,g:3,b:1};
  }
  delete gameState.potatoColor;
  delete gameState.ownedPotatoColors;
  for(const k of ["r","g","b"]){
    const n=Math.round(Number(gameState.potatoRGB[k]));
    gameState.potatoRGB[k]=Number.isFinite(n)?Math.max(0,Math.min(9,n)):(k==="r"?6:k==="g"?3:1);
  }
  if(!gameState.cosmetics||typeof gameState.cosmetics!=="object")gameState.cosmetics={};
  if(!gameState.equippedCosmetics||typeof gameState.equippedCosmetics!=="object")gameState.equippedCosmetics={head:null,face:null,chest:null,back:null};
  if(!Array.isArray(gameState.favorites))gameState.favorites=[];
  gameState.favorites=gameState.favorites.filter(id=>BAT_CATALOG.some(b=>b.id===id)).slice(0,50);
  if(!Array.isArray(gameState.loadouts))gameState.loadouts=["office",null,null];
  gameState.loadouts=gameState.loadouts.slice(0,3);

  for(const b of BAT_CATALOG){
    const s=gameState.bats[b.id];
    if(!s) continue;
    s.count=Math.max(1,Number.isFinite(s.count)?Math.floor(s.count):1);
    s.level=Math.max(1,Math.min(50,Number.isFinite(s.level)?Math.floor(s.level):1));
    s.xp=Math.max(0,Number.isFinite(s.xp)?Math.floor(s.xp):0);
    if(s.level>=50)s.xp=0;
    else s.xp=Math.min(s.xp,batXpNeeded(s.level)-1);
  }
  for(const m of MAP_CATALOG){
    const p=gameState.mapProgress[m.id]||(gameState.mapProgress[m.id]={level:1,waveKills:0,bossWins:0});
    p.level=Math.max(1,Math.min(10,Number.isFinite(p.level)?Math.floor(p.level):1));
    p.waveKills=Math.max(0,Math.min(2,Number.isFinite(p.waveKills)?Math.floor(p.waveKills):0));
    p.bossWins=Math.max(0,Number.isFinite(p.bossWins)?Math.floor(p.bossWins):0);
  }
  if(!["left","right"].includes(gameState.settings.batHand))gameState.settings.batHand="right";
  if(!["left","right"].includes(gameState.settings.dominantHand))gameState.settings.dominantHand=gameState.settings.leftHanded?"left":"right";
  gameState.settings.leftHanded=gameState.settings.dominantHand==="left";
  if(!["left","right"].includes(gameState.settings.menuHand))gameState.settings.menuHand="left";
  if(!["CHILL","NORMAL","CRAZY"].includes(gameState.settings.npcDifficulty))gameState.settings.npcDifficulty="NORMAL";
  if(!Number.isFinite(Number(gameState.settings.handReach)))gameState.settings.handReach=1.00;
  gameState.settings.handReach=BABYLON.Scalar.Clamp(Number(gameState.settings.handReach),.85,1.15);
  gameState.settings.holsterEnabled=gameState.settings.holsterEnabled!==false;
  saveGame();applyPerformanceMode();updateStatsUI();

  function oppositeHand(side){return side==="left"?"right":"left";}
  function batHandSide(){return gameState.settings.batHand==="left"?"left":"right";}
  function dominantHandSide(){return gameState.settings.dominantHand==="left"?"left":"right";}
  function menuHandSide(){return gameState.settings.menuHand==="right"?"right":"left";}
  function batHand(){return hands[batHandSide()];}
  function supportHand(){return hands[oppositeHand(batHandSide())];}
  function menuHand(){return hands[menuHandSide()];}

  function attachBatToSelectedHand(){
    const h=batHand();
    if(!h?.node){
      batThrown=false;batRecalling=false;batThrowVel.set(0,0,0);
      batTipLast=null;batBaseLast=null;
      batRoot.parent=null;batRoot.setEnabled(false);
      return false;
    }
    batRoot.parent=h.node;
    batRoot.position.set(0,0,0);
    batRoot.rotationQuaternion=BABYLON.Quaternion.Identity();
    batRoot.setEnabled(true);
    batThrown=false;batRecalling=false;batHolstered=false;batThrowVel.set(0,0,0);
    batTipLast=null;batBaseLast=null;
    return true;
  }

  function saveControlChoice(key,value){
    if(!["left","right"].includes(value))return;
    gameState.settings[key]=value;
    if(key==="dominantHand")gameState.settings.leftHanded=value==="left";
    saveGame();
    if(key==="batHand")attachBatToSelectedHand();
  }

  // ------------------------------------------------------------
  // Shared lobby: mirror exists ONLY here. Procedural map arenas keep Quest cost low.
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // Inventory quality-of-life / shop
  // ------------------------------------------------------------
  function toggleFavoriteBat(id=gameState.selectedBat){
    const i=gameState.favorites.indexOf(id);
    if(i>=0)gameState.favorites.splice(i,1);else gameState.favorites.push(id);
    saveGame();
  }
  function saveLoadout(slot){
    if(slot<0||slot>2)return;
    gameState.loadouts[slot]=gameState.selectedBat;saveGame();
  }
  function equipLoadout(slot){
    const id=gameState.loadouts[slot];
    if(id&&gameState.bats[id]){gameState.selectedBat=id;applyBatLook();saveGame();}
  }
  function dailyShopItems(){
    const seed=Number(todayKey().replaceAll("-",""));
    const arr=[...BAT_CATALOG].sort((a,b)=>((a.id.charCodeAt(0)*31+seed)%97)-((b.id.charCodeAt(0)*31+seed)%97));
    return arr.slice(0,3);
  }

  const LOBBY_CENTER=new BABYLON.Vector3(30,0,-6),RUNTIME_CENTER=new BABYLON.Vector3(66,0,-6);
  const lobbyFloorMat=mkMat("lobbyFloorMat","#202b38"),lobbyWallMat=mkMat("lobbyWallMat","#334155"),lobbyAccent=mkMat("lobbyAccent","#1688c8");
  const lobbyMeshes=[];
  function lobbyBox(n,p,s,m=lobbyWallMat,c=true){const x=box(n,p,s,m,c);lobbyMeshes.push(x);return x;}
  lobbyBox("lobbyFloor",new BABYLON.Vector3(30,-.12,-6),new BABYLON.Vector3(14,.24,14),lobbyFloorMat,true);
  lobbyBox("lobbyBack",new BABYLON.Vector3(30,2.1,-13),new BABYLON.Vector3(14,4.2,.2));
  lobbyBox("lobbyLeft",new BABYLON.Vector3(23,2.1,-6),new BABYLON.Vector3(.2,4.2,14));
  lobbyBox("lobbyRight",new BABYLON.Vector3(37,2.1,-6),new BABYLON.Vector3(.2,4.2,14));
  lobbyBox("lobbyFrontL",new BABYLON.Vector3(25.3,2.1,1),new BABYLON.Vector3(4.6,4.2,.2));
  lobbyBox("lobbyFrontR",new BABYLON.Vector3(34.7,2.1,1),new BABYLON.Vector3(4.6,4.2,.2));
  [[25,-10.8,"BAT"],[28.35,-10.8,"SKIN"],[31.7,-10.8,"MAP"],[35,-10.8,"BUNDLE"]].forEach((d,i)=>lobbyBox("lobbyStand"+i,new BABYLON.Vector3(d[0],.55,d[1]),new BABYLON.Vector3(2.3,1.1,.7),i===3?darkTrimMat:lobbyAccent));

  // Move the existing mirror out of the Office and into the lobby.
  mirrorFrame.position.set(23.12,1.78,-6);mirror.position.set(23.015,1.78,-6);mirror.rotation.y=Math.PI/2;mirrorTex.mirrorPlane=new BABYLON.Plane(1,0,0,-23.0);

  let gameMode="lobby",runtimeMapRoot=null,runtimeColliders=[],lobbySelection=0,lobbySub="main",lobbyIndex=0,lastLobbyMessage="";
  let lobbyAvatarPreviewRoot=null,lobbyBatPreviewRoot=null,practiceDummy=null;
  let practiceDummyHitFlash=0,practiceDummyLastHit=0,practiceDummyBestHit=0;
  let batHolstered=false,holsterCooldown=0;
  const lobbyMenu=["PLAY / MAPS","BAT CRATE — 750 COINS","SKIN CRATE — 650 COINS","MAP CRATE — 1200 COINS","GEM CRATE — 80 GEMS","BAT INVENTORY","SKIN INVENTORY","COSMETIC SHOP","POTATO COLOR MIXER","MODES — NORMAL/SURVIVAL/ENDLESS/HARDCORE","DAILY + WEEKLY MISSIONS","COLLECTION","TRADING — ONLINE BUILD","PUBLIC LOBBY • UP TO 8","BUNDLES — €4.99 / €8.00","AUDIO / CAMERA / TRAINING (also in menu)","CONTROL SETUP","AVATAR PREVIEW","BAT INSPECT","PRACTICE DUMMY","NPC DIFFICULTY","HAND CALIBRATION","BAT HOLSTER","GEM SHOP • REAL MONEY",...(OWNER_ACCESS?["OWNER VAULT / GIVEAWAY"]:[])];
  const lobbyScreen=BABYLON.MeshBuilder.CreatePlane("lobbyScreen",{width:4.5,height:3.25},scene);lobbyScreen.position.set(30,2.15,-12.82);lobbyScreen.isPickable=false;
  const lobbyGui=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(lobbyScreen,1100,800),lobbyBg=new BABYLON.GUI.Rectangle();lobbyBg.background="#07111FEE";lobbyBg.color="#5dd6ff";lobbyBg.thickness=5;lobbyBg.cornerRadius=26;lobbyGui.addControl(lobbyBg);
  const lobbyText=new BABYLON.GUI.TextBlock();lobbyText.color="white";lobbyText.fontSize=28;lobbyText.fontWeight="700";lobbyText.textHorizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;lobbyText.textVerticalAlignment=BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;lobbyText.paddingTop="25px";lobbyText.paddingLeft="30px";lobbyText.paddingRight="25px";lobbyText.textWrapping=true;lobbyBg.addControl(lobbyText);
  const wrap=(i,n)=>n?((i%n)+n)%n:0;
  function lobbyMain(){lobbyText.fontSize=OWNER_ACCESS?22:23;const b=selectedBatData(),s=selectedBatState();let t=`POTATO BRAWL LOBBY${OWNER_ACCESS?" • OWNER":""}
🪙 ${gameState.coins}   💎 ${gameState.gems}\n${b.name} Lv.${s.level} • ${b.ability}\n\n`;lobbyMenu.forEach((x,i)=>t+=`${i===lobbySelection?"▶ ":"   "}${x}\n`);if(lastLobbyMessage)t+=`\n${lastLobbyMessage}`;return t;}
  function lobbyMaps(){const ids=ownedMapIds(),id=ids[wrap(lobbyIndex,ids.length)]||"office",m=MAP_CATALOG.find(x=>x.id===id),p=gameState.mapProgress[id];return `MAP SELECT\n\n${lobbyIndex+1}/${ids.length} ${m.name}\n${m.rarity} • Level ${p.level}/10\nWave KOs ${p.waveKills}/3 • Boss wins ${p.bossWins}\nMode: ${gameState.mode}\n\nStick = change • Trigger = PLAY • Grip = back`;}
  function lobbyBats(){const ids=ownedBatIds(),id=ids[wrap(lobbyIndex,ids.length)]||"office",b=BAT_CATALOG.find(x=>x.id===id),s=gameState.bats[id];return `BAT INVENTORY\n\n${b.name}\n${b.rarity}\nAbility: ${b.ability}\nLEVEL ${s.level}/50 • XP ${s.level>=50?"MAX":`${s.xp}/${batXpNeeded(s.level)}`}\nCopies: ${s.count}\n\nTrigger = equip • Stick = next • Grip = back`;}
  function lobbySkins(){const ids=ownedSkinIds(),id=ids[wrap(lobbyIndex,ids.length)]||"classic",s=SKIN_CATALOG.find(x=>x.id===id);return `SKIN INVENTORY\n\n${s.name}\n${s.rarity}\nCopies: ${gameState.skins[id]}\n\nTrigger = equip • Stick = next • Grip = back`;}
  function lobbyDup(){const d=gameState.pendingDuplicate,[c,g]=REFUND[d.rarity];const opts=["KEEP FOR TRADING",`COINS +${c}`,`GEMS +${g}`];return `DUPLICATE!\n\n${d.name} • ${d.rarity}\n\n${opts.map((x,i)=>(i===lobbyIndex?"▶ ":"   ")+x).join("\n")}\n\nStick = choose • Trigger = confirm`;}

  let avatarHandprintMat=null,avatarFloatHandMat=null;
  let voiceAnalyser=null,voiceData=null,voiceStream=null,voiceMicRequested=false;
  let localVoiceActive=false,voiceHold=0;

  async function initVoiceFaceMic(){
    if(voiceMicRequested)return;
    voiceMicRequested=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia)return;
      voiceStream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
        video:false
      });
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      const ac=new AC();
      if(ac.state==="suspended")await ac.resume();
      const src=ac.createMediaStreamSource(voiceStream);
      voiceAnalyser=ac.createAnalyser();
      voiceAnalyser.fftSize=256;
      voiceAnalyser.smoothingTimeConstant=.35;
      voiceData=new Uint8Array(voiceAnalyser.fftSize);
      src.connect(voiceAnalyser);
    }catch(_){
      voiceAnalyser=null;voiceData=null;
    }
  }

  function updateLocalVoiceFace(dt){
    let rms=0;
    if(voiceAnalyser&&voiceData){
      voiceAnalyser.getByteTimeDomainData(voiceData);
      let sum=0;
      for(let i=0;i<voiceData.length;i++){
        const v=(voiceData[i]-128)/128;
        sum+=v*v;
      }
      rms=Math.sqrt(sum/voiceData.length);
    }
    if(rms>.025)voiceHold=.30;
    else voiceHold=Math.max(0,voiceHold-dt);
    localVoiceActive=voiceHold>0;
  }

  addEventListener("crazy-office-start-click",()=>{initVoiceFaceMic();},{once:true});

  function ensureAvatarSlapMats(){
    if(avatarHandprintMat&&avatarFloatHandMat)return;
    const makeHandTex=(name,color)=>{
      const tex=new BABYLON.DynamicTexture(name,{width:256,height:256},scene,true);
      const ctx=tex.getContext();ctx.clearRect(0,0,256,256);
      ctx.fillStyle="rgba(0,0,0,0)";
      ctx.fillRect(0,0,256,256);
      ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(128,154,48,0,Math.PI*2);ctx.fill();
      const fingers=[
        [70,42,24,82,-.10],[100,26,22,90,-.04],[128,18,22,96,0],[156,26,22,90,.04],[186,44,24,82,.10]
      ];
      for(const [x,y,w,h,rot] of fingers){
        ctx.save();
        ctx.translate(x+w*.5,y+h*.5);ctx.rotate(rot);
        ctx.fillRect(-w*.5,-h*.5,w,h);
        ctx.restore();
      }
      ctx.fillRect(86,148,34,58);
      ctx.fillRect(132,148,34,58);
      ctx.save();
      ctx.translate(72,142);ctx.rotate(-.72);ctx.fillRect(-18,-12,58,24);ctx.restore();
      tex.update();
      return tex;
    };

    const handTex=makeHandTex("avatarFloatHandTex","#f7d1b4");
    avatarFloatHandMat=new BABYLON.StandardMaterial("avatarFloatHandMat",scene);
    avatarFloatHandMat.diffuseTexture=handTex;
    avatarFloatHandMat.opacityTexture=handTex;
    avatarFloatHandMat.emissiveColor=new BABYLON.Color3(.35,.24,.18);
    avatarFloatHandMat.disableLighting=true;
    avatarFloatHandMat.backFaceCulling=false;

    const printTex=makeHandTex("avatarHandprintTex","rgba(230,45,45,.95)");
    avatarHandprintMat=new BABYLON.StandardMaterial("avatarHandprintMat",scene);
    avatarHandprintMat.diffuseTexture=printTex;
    avatarHandprintMat.opacityTexture=printTex;
    avatarHandprintMat.emissiveColor=new BABYLON.Color3(.65,.08,.08);
    avatarHandprintMat.disableLighting=true;
    avatarHandprintMat.backFaceCulling=false;
  }

  function funnyPotatoFaceParts(head,prefix){
    const eyeWhite=mkMat(prefix+"EyeWhite","#f7f7f4");
    const pupilMat=mkMat(prefix+"Pupil","#131313");
    const browMat=mkMat(prefix+"Brow","#49342a");
    const mouthMat=mkMat(prefix+"Mouth","#2a1711");
    const cheekMat=mkMat(prefix+"Cheek","#f1a2a6");
    const toothMat=mkMat(prefix+"Tooth","#fff8ef");
    const noseMat=mkMat(prefix+"Nose","#d49b73");

    const parts={eyes:[],pupils:[],brows:[],cheeks:[]};

    for(const sx of [-1,1]){
      const eye=BABYLON.MeshBuilder.CreateSphere(prefix+"Eye"+sx,{diameter:.115,segments:10},scene);
      eye.parent=head;eye.position.set(.115*sx,.065,.255);eye.scaling.z=.46;eye.material=eyeWhite;
      const pupil=BABYLON.MeshBuilder.CreateSphere(prefix+"Pupil"+sx,{diameter:.05,segments:8},scene);
      pupil.parent=head;pupil.position.set(.13*sx,.045,.312);pupil.scaling.z=.28;pupil.material=pupilMat;
      const brow=BABYLON.MeshBuilder.CreateBox(prefix+"Brow"+sx,{width:.12,height:.025,depth:.02},scene);
      brow.parent=head;brow.position.set(.11*sx,.145,.245);brow.rotation.z=sx<0?-.18:.18;brow.material=browMat;
      const cheek=BABYLON.MeshBuilder.CreateSphere(prefix+"Cheek"+sx,{diameter:.07,segments:8},scene);
      cheek.parent=head;cheek.position.set(.16*sx,-.04,.245);cheek.scaling.z=.34;cheek.material=cheekMat;
      parts.eyes.push(eye);parts.pupils.push(pupil);parts.brows.push(brow);parts.cheeks.push(cheek);
    }

    const nose=BABYLON.MeshBuilder.CreateSphere(prefix+"Nose",{diameter:.07,segments:8},scene);
    nose.parent=head;nose.position.set(0,.00,.28);nose.scaling.z=.45;nose.material=noseMat;

    const mouth=BABYLON.MeshBuilder.CreateTorus(prefix+"Smile",{diameter:.21,thickness:.028,tessellation:18},scene);
    mouth.parent=head;mouth.position.set(0,-.06,.238);mouth.rotation.x=Math.PI*.5;mouth.rotation.z=Math.PI;mouth.scaling.y=.55;mouth.material=mouthMat;

    const toothL=BABYLON.MeshBuilder.CreateBox(prefix+"ToothL",{width:.038,height:.05,depth:.018},scene);
    toothL.parent=head;toothL.position.set(-.024,-.08,.253);toothL.material=toothMat;
    const toothR=toothL.clone(prefix+"ToothR");toothR.parent=head;toothR.position.x=.024;

    const tongue=BABYLON.MeshBuilder.CreateSphere(prefix+"Tongue",{diameter:.052,segments:8},scene);
    tongue.parent=head;tongue.position.set(.008,-.112,.232);tongue.scaling.set(1,.72,.46);tongue.material=mkMat(prefix+"TongueMat","#f17a92");

    parts.nose=nose;parts.mouth=mouth;parts.toothL=toothL;parts.toothR=toothR;parts.tongue=tongue;
    return parts;
  }

  function addAvatarButtRig(root,bodyMat,prefix){
    ensureAvatarSlapMats();
    const buttL=BABYLON.MeshBuilder.CreateSphere(prefix+"ButtL",{diameter:.46,segments:12},scene);
    buttL.parent=root;buttL.material=bodyMat;
    const buttR=buttL.clone(prefix+"ButtR");buttR.parent=root;

    const printPlane=BABYLON.MeshBuilder.CreatePlane(prefix+"ButtPrint",{width:.26,height:.26},scene);
    printPlane.parent=root;printPlane.material=avatarHandprintMat;printPlane.isPickable=false;
    printPlane.billboardMode=0;printPlane.rotation.x=.08;printPlane.setEnabled(false);

    const floatHand=BABYLON.MeshBuilder.CreatePlane(prefix+"FloatHand",{width:.32,height:.32},scene);
    floatHand.parent=root;floatHand.material=avatarFloatHandMat;floatHand.isPickable=false;
    floatHand.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;floatHand.setEnabled(false);

    return {buttL,buttR,printPlane,floatHand};
  }

  function avatarRearVector(av){
    const q=av?.head?.rotationQuaternion||BABYLON.Quaternion.Identity();
    let rear=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,-1),BABYLON.Matrix.FromQuaternion(q));
    rear.y=0;if(rear.lengthSquared()<.0001)rear.set(0,0,-1);
    return rear.normalize();
  }

  function avatarRightVector(av){
    const q=av?.head?.rotationQuaternion||BABYLON.Quaternion.Identity();
    let right=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),BABYLON.Matrix.FromQuaternion(q));
    right.y=0;if(right.lengthSquared()<.0001)right.set(1,0,0);
    return right.normalize();
  }

  function avatarButtCenter(av){
    if(!av?.chest)return BABYLON.Vector3.Zero();
    return av.chest.position.add(avatarRearVector(av).scale(.30)).add(new BABYLON.Vector3(0,.02,0));
  }

  function triggerAvatarSlapVisual(av,zone="butt",handSide="right",strength=.9,targetSide=null){
    if(!av)return;
    playImpactSound("slap",Math.max(.55,Math.min(1.2,strength)));
    if(zone==="butt"){
      av.slapPrintTimer=15;
      av.slapFloatTimer=1;
      av.slapPrintSide=handSide==="left"?-1:1;
      av.buttJiggle=Math.max(av.buttJiggle||0,.28+Math.min(.42,strength*.30));
      av.buttJiggleTimer=2.4;
      if(av.printPlane){
        av.printPlane.setEnabled(true);
        const rear=avatarRearVector(av),right=avatarRightVector(av);
        av.printPlane.position.copyFrom(avatarButtCenter(av).add(rear.scale(.17)).add(right.scale(.10*av.slapPrintSide)));
        av.printPlane.lookAt(av.printPlane.position.add(rear));
      }
      if(av.floatHand){
        av.floatHand.setEnabled(true);
        const rear=avatarRearVector(av),right=avatarRightVector(av);
        av.floatHand.position.copyFrom(avatarButtCenter(av).add(rear.scale(.08)).add(right.scale(.12*av.slapPrintSide)).add(new BABYLON.Vector3(0,.16,0)));
      }
    }else if(zone==="hand"){
      av.handSlapTimer=.55;
      av.handSlapSide=targetSide==="left"?"left":targetSide==="right"?"right":(handSide==="left"?"left":"right");
      av.handSlapKick=.10+Math.min(.16,strength*.08);
      av.faceReactTimer=.65;
    }
  }

  function applySlapToTarget(targetId,zone="butt",handSide="right",strength=.9,targetSide=null){
    let hitAvatar=null;
    for(const [id,p] of net.players){
      if(id===targetId&&p?.avatar){hitAvatar=p.avatar;break;}
    }
    if(hitAvatar&&hitAvatar.root?.isEnabled?.())triggerAvatarSlapVisual(hitAvatar,zone,handSide,strength,targetSide);
    else if(targetId==="host"||targetId===net.playerId){
      playImpactSound("slap",Math.max(.55,Math.min(1.2,strength)));
      cameraImpactShake=Math.max(cameraImpactShake,zone==="butt"?.22:.14);
      if(zone==="hand"&&targetSide&&hands[targetSide])pulse(hands[targetSide],.34,55);
      else {pulse(hands.left,.14,32);pulse(hands.right,.14,32);}
    }
  }

  function localSlapTarget(targetId,zone="butt",handSide="right",strength=.9,targetSide=null){
    if(!net.connected||!targetId)return;
    if(net.isHost){
      applySlapToTarget(targetId,zone,handSide,strength,targetSide);
      if(gameMode==="map")broadcastMatch({t:"slap",target:targetId,zone,side:handSide,targetSide,strength});
      else broadcast({t:"slap",target:targetId,zone,side:handSide,targetSide,strength});
    }else{
      sendHost({t:"slap",target:targetId,zone,side:handSide,targetSide,strength});
    }
  }

  function updateMultiplayerSlaps(dt){
    if(gameMode!=="map"||!net.connected||playerDead||!isInXR())return;
    for(const side of ["left","right"]){
      const h=hands[side];
      if(!h||!h.node)continue;
      h.slapCooldown=Math.max(0,(h.slapCooldown||0)-dt);
      const pos=calibratedHandWorld(h); if(!pos)continue;
      if(!h.slapPrevPos)h.slapPrevPos=pos.clone();
      const prevSlapPos=h.slapPrevPos.clone();
      const vel=pos.subtract(prevSlapPos).scale(1/Math.max(dt,.016));
      h.slapPrevWorld=prevSlapPos;
      h.slapPrevPos.copyFrom(pos);
      const speed=vel.length();
      if(speed<1.05||h.slapCooldown>0)continue;

      const guestNpcSlap=net.connected&&!net.isHost;
      const npcZone=trySlapNpc(side,pos,speed,!guestNpcSlap);
      if(npcZone){
        h.slapCooldown=.32;
        const slapStrength=Math.min(1.15,.45+speed*.12);
        if(guestNpcSlap)sendHost({t:"npcSlap",zone:npcZone,side,strength:slapStrength});
        else if(net.isHost&&net.connected)broadcastMatch({t:"npcSlap",zone:npcZone,side,strength:slapStrength,by:"host"});
        pulse(h,npcZone==="butt"?.55:.36,npcZone==="butt"?70:48);
        continue;
      }

      let chosen=null;
      for(const [id,p] of net.players){
        const av=p?.avatar;
        if(!av||!av.root?.isEnabled?.()||p.dead)continue;

        const handZoneRadius=.19,buttZoneRadius=.23;
        const buttCenter=avatarButtCenter(av);
        const dButt=BABYLON.Vector3.Distance(pos,buttCenter);
        if(dButt<buttZoneRadius){
          chosen={id,zone:"butt",score:dButt,av};
          break;
        }

        const sweepFrom=h.slapPrevWorld||pos;
        const dl=av.left?pointSegmentDistance(av.left.position,sweepFrom,pos):99;
        const dr=av.right?pointSegmentDistance(av.right.position,sweepFrom,pos):99;
        const bestHand=Math.min(dl,dr);
        if(bestHand<handZoneRadius){
          chosen={id,zone:"hand",score:bestHand,av,targetSide:dl<=dr?"left":"right"};
        }
      }

      if(chosen){
        h.slapCooldown=chosen.zone==="butt"?.38:.24;
        const slapStrength=Math.min(1.15,.45+speed*.12);
        localSlapTarget(chosen.id,chosen.zone,side,slapStrength,chosen.targetSide||null);
        pulse(h,chosen.zone==="butt"?.55:.38,chosen.zone==="butt"?70:50);
      }
    }
  }

  const OWNER_GIFT_POSITION=new BABYLON.Vector3(31.4,.82,-7.15);
  let ownerGiftState={active:false,id:null,dropId:0,ownerId:null,claimed:new Set()};
  let ownerGiftRoot=null,ownerGiftSpin=0,ownerGiftPickupCooldown=0;

  function disposeOwnerGiftVisual(){
    try{ownerGiftRoot?.dispose?.(false,true);}catch(_){}
    ownerGiftRoot=null;
  }

  function buildOwnerGiftVisual(id){
    disposeOwnerGiftVisual();
    if(!OWNER_COSMETIC_IDS.includes(id))return;
    ownerGiftRoot=new BABYLON.TransformNode("ownerGiftRoot",scene);
    ownerGiftRoot.position.copyFrom(OWNER_GIFT_POSITION);

    const cyan=mkMat("giftCyan"+Math.random(),"#20e7ff");
    const pink=mkMat("giftPink"+Math.random(),"#ff46df");
    const gold=mkMat("giftGold"+Math.random(),"#ffd76a");
    const dark=mkMat("giftDark"+Math.random(),"#080a14");
    cyan.emissiveColor=BABYLON.Color3.FromHexString("#20e7ff").scale(.95);
    pink.emissiveColor=BABYLON.Color3.FromHexString("#ff46df").scale(.85);
    gold.emissiveColor=BABYLON.Color3.FromHexString("#ffd76a").scale(.6);

    const pedestal=BABYLON.MeshBuilder.CreateCylinder("ownerGiftPedestal",{height:.18,diameterTop:.50,diameterBottom:.62,tessellation:20},scene);
    pedestal.parent=ownerGiftRoot;pedestal.position.y=-.62;pedestal.material=dark;
    const glowRing=BABYLON.MeshBuilder.CreateTorus("ownerGiftGlow",{diameter:.58,thickness:.035,tessellation:24},scene);
    glowRing.parent=ownerGiftRoot;glowRing.position.y=-.50;glowRing.rotation.x=Math.PI/2;glowRing.material=cyan;

    if(id==="ownerCrown"){
      const ring=BABYLON.MeshBuilder.CreateTorus("giftCrown",{diameter:.34,thickness:.04,tessellation:20},scene);
      ring.parent=ownerGiftRoot;ring.position.y=.10;ring.rotation.x=Math.PI/2;ring.material=cyan;
      for(let i=0;i<6;i++){
        const s=BABYLON.MeshBuilder.CreateCylinder("giftCrownSpike"+i,{height:.20,diameterTop:0,diameterBottom:.065,tessellation:6},scene);
        const a=i/6*Math.PI*2;s.parent=ownerGiftRoot;s.position.set(Math.cos(a)*.12,.23,Math.sin(a)*.12);s.material=i%2?gold:pink;
      }
    }else if(id==="ownerVisor"){
      const body=BABYLON.MeshBuilder.CreateBox("giftVisor",{width:.42,height:.11,depth:.06},scene);
      body.parent=ownerGiftRoot;body.position.y=.10;body.material=dark;
      const glow=BABYLON.MeshBuilder.CreateBox("giftVisorGlow",{width:.34,height:.03,depth:.015},scene);
      glow.parent=ownerGiftRoot;glow.position.set(0,.10,.04);glow.material=pink;
    }else if(id==="ownerCore"){
      const ring=BABYLON.MeshBuilder.CreateTorus("giftCore",{diameter:.36,thickness:.045,tessellation:20},scene);
      ring.parent=ownerGiftRoot;ring.position.y=.10;ring.rotation.x=Math.PI/2;ring.material=cyan;
      const orb=BABYLON.MeshBuilder.CreateSphere("giftCoreOrb",{diameter:.14,segments:12},scene);
      orb.parent=ownerGiftRoot;orb.position.y=.10;orb.material=pink;
    }else if(id==="ownerCape"){
      const cape=BABYLON.MeshBuilder.CreateBox("giftCape",{width:.42,height:.50,depth:.035},scene);
      cape.parent=ownerGiftRoot;cape.position.y=.04;cape.material=dark;
      const edge=BABYLON.MeshBuilder.CreateBox("giftCapeGlow",{width:.34,height:.035,depth:.012},scene);
      edge.parent=ownerGiftRoot;edge.position.set(0,.12,.025);edge.material=pink;
    }

    ownerGiftRoot.setEnabled(gameMode==="lobby"&&(OWNER_ACCESS||!gameState.cosmetics?.[id]));
  }

  function syncOwnerGiftVisual(){
    if(!ownerGiftState.active||!ownerGiftState.id){
      disposeOwnerGiftVisual();return;
    }
    if(!ownerGiftRoot)buildOwnerGiftVisual(ownerGiftState.id);
    ownerGiftRoot?.setEnabled?.(gameMode==="lobby"&&(OWNER_ACCESS||!gameState.cosmetics?.[ownerGiftState.id]));
  }

  function activateOwnerGiftDrop(id,ownerId){
    if(!OWNER_COSMETIC_IDS.includes(id))return false;
    ownerGiftState.active=true;
    ownerGiftState.id=id;
    ownerGiftState.dropId=(ownerGiftState.dropId||0)+1;
    ownerGiftState.ownerId=ownerId;
    ownerGiftState.claimed=new Set([ownerId]);
    buildOwnerGiftVisual(id);
    if(net.isHost)broadcast({t:"ownerGiftDrop",id,dropId:ownerGiftState.dropId,ownerId});
    return true;
  }

  function clearOwnerGiftDrop(){
    const dropId=ownerGiftState.dropId||0;
    ownerGiftState={active:false,id:null,dropId,ownerId:null,claimed:new Set()};
    disposeOwnerGiftVisual();
    if(net.isHost)broadcast({t:"ownerGiftClear"});
  }

  function requestOwnerGiftDrop(id){
    if(!OWNER_ACCESS||!OWNER_COSMETIC_IDS.includes(id)){
      lastLobbyMessage="OWNER ONLY";return;
    }
    if(gameMode!=="lobby"){
      lastLobbyMessage="DROP GIFTS IN THE PUBLIC LOBBY";return;
    }
    if(net.isHost){
      activateOwnerGiftDrop(id,"host");
      lastLobbyMessage=`GIFT DROP LIVE • ${COSMETIC_CATALOG.find(x=>x.id===id)?.name||id}`;
    }else if(net.connected){
      sendHost({t:"ownerGiftDropRequest",id});
      lastLobbyMessage="OWNER GIFT DROP SENT";
    }else{
      lastLobbyMessage="CONNECTING TO PUBLIC LOBBY...";
      ensurePublicLobby();
    }
  }

  function grantOwnerGift(id){
    if(!OWNER_COSMETIC_IDS.includes(id))return;
    gameState.cosmetics=gameState.cosmetics||{};
    gameState.cosmetics[id]=true;
    saveGame();applyCosmetics();
    lastLobbyMessage=`OWNER GIFT CLAIMED • ${COSMETIC_CATALOG.find(x=>x.id===id)?.name||id}`;
    syncOwnerGiftVisual();
    refreshLobby();
  }

  function updateOwnerGift(dt){
    ownerGiftPickupCooldown=Math.max(0,ownerGiftPickupCooldown-dt);

    if(ownerGiftRoot&&ownerGiftRoot.isEnabled()){
      ownerGiftSpin+=dt;
      ownerGiftRoot.rotation.y=ownerGiftSpin*.9;
      ownerGiftRoot.position.y=OWNER_GIFT_POSITION.y+Math.sin(ownerGiftSpin*2.1)*.06;
    }

    if(gameMode!=="lobby"||!ownerGiftState.active||!ownerGiftState.id||gameState.cosmetics?.[ownerGiftState.id]||ownerGiftPickupCooldown>0)return;

    const handPositions=[hands.left,hands.right]
      .filter(h=>h?.node)
      .map(h=>calibratedHandWorld(h))
      .filter(Boolean);

    if(!handPositions.some(p=>BABYLON.Vector3.Distance(p,OWNER_GIFT_POSITION)<.42))return;

    ownerGiftPickupCooldown=1.0;
    if(net.isHost){
      if(!ownerGiftState.claimed.has("host")){
        ownerGiftState.claimed.add("host");
        grantOwnerGift(ownerGiftState.id);
      }
    }else if(net.connected){
      sendHost({t:"ownerGiftClaim",dropId:ownerGiftState.dropId});
    }
  }

  function lobbyOwnerVault(){
    const id=OWNER_COSMETIC_IDS[wrap(lobbyIndex,OWNER_COSMETIC_IDS.length)];
    const c=COSMETIC_CATALOG.find(x=>x.id===id);
    return `OWNER VAULT • GIVEAWAY\n\n${lobbyIndex+1}/${OWNER_COSMETIC_IDS.length} ${c.name}\n${c.rarity} • ${c.slot.toUpperCase()}\n\nTrigger = DROP THIS GIFT IN THE PUBLIC LOBBY\nPlayers can physically grab it from the glowing pedestal.\nThey keep it in their inventory, but cannot gift it onward.\n\nCURRENT DROP: ${ownerGiftState.active?(COSMETIC_CATALOG.find(x=>x.id===ownerGiftState.id)?.name||ownerGiftState.id):"NONE"}\nPUBLIC LOBBY: ${netPlayerCount()}/8\n\nStick = choose gift • Grip = back`;
  }

  function updateCosmeticPreview(){
    applyCosmetics();
    if(lobbySub==="cosmetics"){
      const c=COSMETIC_CATALOG[wrap(lobbyIndex,COSMETIC_CATALOG.length)];
      previewCosmeticId=c?.id||null;
      if(c&&!gameState.cosmetics[c.id]){
        const equippedSameSlot=gameState.equippedCosmetics?.[c.slot];
        if(equippedSameSlot&&cosmeticMeshes[equippedSameSlot])cosmeticMeshes[equippedSameSlot].setEnabled(false);
        const m=makeCosmeticMesh(c.id);m?.setEnabled?.(true);
      }
    }else{
      previewCosmeticId=null;
    }
  }

  function lobbyCosmetics(){
    updateCosmeticPreview();
    const c=COSMETIC_CATALOG[wrap(lobbyIndex,COSMETIC_CATALOG.length)];
    const owned=!!gameState.cosmetics[c.id];
    const equipped=gameState.equippedCosmetics?.[c.slot]===c.id;
    const price=c.type==="gem"?`${c.price} GEMS`:c.type==="owner"?"OWNER GIFT ONLY":c.price;
    const action=owned?(equipped?"EQUIPPED • Trigger = UNEQUIP":"OWNED • Trigger = EQUIP"):
      c.type==="gem"?"Trigger = BUY":
      c.type==="owner"?"Find the OWNER in a public lobby":"PREMIUM • Meta purchase later";
    return `COSMETIC SHOP

${lobbyIndex+1}/${COSMETIC_CATALOG.length} ${c.name}
${c.rarity} • ${c.slot.toUpperCase()}
PRICE: ${price}

${action}

💎 ${gameState.gems}
Stick = browse • Trigger = select • Grip = back`;
  }

  function lobbyPotatoColors(){
    const rows=[
      `RED:   ${gameState.potatoRGB.r}`,
      `GREEN: ${gameState.potatoRGB.g}`,
      `BLUE:  ${gameState.potatoRGB.b}`
    ];
    let t=`POTATO COLOR MIXER\n\nCOLOR CODE: ${gameState.potatoRGB.r} ${gameState.potatoRGB.g} ${gameState.potatoRGB.b}\n${potatoRgbHex(gameState.potatoRGB).toUpperCase()}\n\n`;
    rows.forEach((x,i)=>t+=`${i===lobbyIndex?"▶ ":"   "}${x}\n`);
    t+=`\nStick = choose R/G/B\nTrigger = +1 • 9 wraps to 0\nGrip = back\n\nMix all 3 numbers to make your own color.`;
    return t;
  }

  function enableFreeTestMode(){
    if(!gameState.testModeBackup){
      gameState.testModeBackup=JSON.parse(JSON.stringify({
        coins:gameState.coins||0,gems:gameState.gems||0,
        bats:gameState.bats||{},skins:gameState.skins||{},
        maps:gameState.maps||{},mapProgress:gameState.mapProgress||{},cosmetics:gameState.cosmetics||{},
        selectedBat:gameState.selectedBat,selectedSkin:gameState.selectedSkin,
        equippedCosmetics:gameState.equippedCosmetics||{}
      }));
    }
    gameState.settings.testMode=true;

    // Plenty of test currency.
    gameState.coins=Math.max(gameState.coins||0,999999);
    gameState.gems=Math.max(gameState.gems||0,999999);

    // Unlock every bat with at least one copy and max test level.
    gameState.bats=gameState.bats||{};
    for(const b of BAT_CATALOG){
      const s=gameState.bats[b.id]||{};
      s.count=Math.max(1,s.count||0);
      s.level=50;
      s.locked=false;
      gameState.bats[b.id]=s;
    }

    // Unlock all skins.
    gameState.skins=gameState.skins||{};
    for(const s of SKIN_CATALOG)gameState.skins[s.id]=true;

    // Unlock every map/progress entry.
    gameState.maps=gameState.maps||{};
    gameState.mapProgress=gameState.mapProgress||{};
    for(const m of MAP_CATALOG){
      gameState.maps[m.id]=Math.max(1,gameState.maps[m.id]||0);
      const p=gameState.mapProgress[m.id]||{};
      p.unlocked=true;
      p.level=Math.max(1,p.level||1);
      gameState.mapProgress[m.id]=p;
    }

    // Unlock cosmetics, including premium ones, in TEST MODE only.
    gameState.cosmetics=gameState.cosmetics||{};
    for(const c of COSMETIC_CATALOG)gameState.cosmetics[c.id]=true;

    saveGame();
    lastLobbyMessage="TEST MODE ON • EVERYTHING UNLOCKED";
  }

  function disableFreeTestMode(){
    gameState.settings.testMode=false;
    if(gameState.testModeBackup){
      const b=gameState.testModeBackup;
      gameState.coins=b.coins??gameState.coins;gameState.gems=b.gems??gameState.gems;
      gameState.bats=b.bats||gameState.bats;gameState.skins=b.skins||gameState.skins;
      gameState.maps=b.maps||gameState.maps;gameState.mapProgress=b.mapProgress||gameState.mapProgress;gameState.cosmetics=b.cosmetics||gameState.cosmetics;
      gameState.selectedBat=b.selectedBat||"office";gameState.selectedSkin=b.selectedSkin||"classic";
      gameState.equippedCosmetics=b.equippedCosmetics||{};
      delete gameState.testModeBackup;
      applyBatLook();applySkinLook();applyCosmetics();
    }
    saveGame();
    lastLobbyMessage="TEST MODE OFF • ORIGINAL INVENTORY RESTORED";
  }

  function lobbyTestMode(){
    return `FREE TEST MODE

${gameState.settings.testMode?"ON ✓ — TEST EVERYTHING":"OFF"}

When ON:
• ALL BATS • LEVEL 50
• ALL SKINS
• ALL MAPS
• ALL COSMETICS
• 999999 COINS + GEMS
• PREMIUM ITEMS FREE FOR TESTING

This is TESTING ONLY — no real purchase happens.

Trigger = toggle
Grip = back`;
  }

  const NATIVE_PLATFORM=(()=>{
    try{return !!window.CrazyOfficeNative;}catch(_){return false;}
  })();

  function nativePlatformName(){
    try{return window.CrazyOfficeNative?.platformName?.()||"WEBXR";}catch(_){return "WEBXR";}
  }

  function requestNativePurchase(product){
    if(!product?.sku)return false;
    try{
      if(window.CrazyOfficeNative?.purchase){
        window.CrazyOfficeNative.purchase(product.sku);
        lastLobbyMessage=`OPENING META PURCHASE • ${product.price}`;
        return true;
      }
    }catch(_){}
    return false;
  }

  // Native shell calls this only after platform-side verification succeeds.
  // Never grant paid content merely because the browser says "success".
  window.crazyOfficeVerifiedPurchase=function(payload){
    try{
      const r=typeof payload==="string"?JSON.parse(payload):payload;
      if(!r||r.verified!==true||typeof r.sku!=="string")return false;

      const gemPack=GEM_PACKS.find(x=>x.sku===r.sku);
      if(gemPack){
        gameState.gems=Math.max(0,(gameState.gems||0)+gemPack.gems);
        saveGame();
        lastLobbyMessage=`PURCHASE VERIFIED • +${gemPack.gems} GEMS`;
        refreshLobby();
        return true;
      }

      const bundle=BUNDLES.find(x=>x.sku===r.sku);
      if(bundle){
        gameState.coins=Math.max(0,(gameState.coins||0)+(bundle.coins||0));
        gameState.gems=Math.max(0,(gameState.gems||0)+(bundle.gems||0));
        if(bundle.bat){
          gameState.bats=gameState.bats||{};
          const s=gameState.bats[bundle.bat]||{count:0,level:1,xp:0};
          s.count=Math.max(1,(s.count||0)+1);
          gameState.bats[bundle.bat]=s;
        }
        if(bundle.skin){
          gameState.skins=gameState.skins||{};
          gameState.skins[bundle.skin]=true;
        }
        if(bundle.cosmetic){
          gameState.cosmetics=gameState.cosmetics||{};
          gameState.cosmetics[bundle.cosmetic]=true;
        }
        saveGame();
        lastLobbyMessage=`PURCHASE VERIFIED • ${bundle.name}`;
        refreshLobby();
        return true;
      }
    }catch(_){}
    return false;
  };

  function requestPaidProduct(product){
    if(!product)return false;
    if(OWNER_ACCESS){
      lastLobbyMessage="OWNER MODE • PURCHASE NOT NEEDED";
      return false;
    }
    if(NATIVE_PLATFORM&&requestNativePurchase(product)){
      refreshLobby();
      return true;
    }
    lastLobbyMessage=`${product.price} • META IAP NOT CONNECTED IN WEBXR`;
    return false;
  }

  function lobbyGemShop(){
    const p=GEM_PACKS[wrap(lobbyIndex,GEM_PACKS.length)];
    return `GEM SHOP • REAL MONEY\n\n${lobbyIndex+1}/${GEM_PACKS.length} ${p.name}\n💎 ${p.gems} GEMS\nPRICE: ${p.price}\n\nTrigger = BUY\n\nWEBXR TEST BUILD:\nMeta IAP is not connected yet, so this button will NOT charge money or grant gems.\nThe product SKU is ready for a native Meta Store build.${lastLobbyMessage?`\n\n${lastLobbyMessage}`:""}\n\nStick = next • Grip = back`;
  }

  function lobbyBundles(){
    const b=BUNDLES[wrap(lobbyIndex,BUNDLES.length)];
    const bat=BAT_CATALOG.find(x=>x.id===b.bat),skin=SKIN_CATALOG.find(x=>x.id===b.skin);
    const cosmetic=b.cosmetic?COSMETIC_CATALOG.find(x=>x.id===b.cosmetic):null;
    const premiumLine=b.price==="€8.00"?"PREMIUM COSMETIC BUNDLE\n":"";
    return `BUNDLE\n\n${b.name} — ${b.price}\n${bat?.name||b.bat}\n${skin?.name||b.skin}${cosmetic?`\nCOSMETIC: ${cosmetic.name}`:""}\n🪙 ${b.coins}  💎 ${b.gems}\n\nFixed contents — no paid random loot.\n${premiumLine}\nTrigger = BUY\nMeta IAP is not connected in this WebXR build.${lastLobbyMessage?`\n\n${lastLobbyMessage}`:""}\n\nStick = next • Grip = back`;
  }

  function disposePack2Node(n){try{n?.dispose?.(false,true);}catch(_){}}

  function buildAvatarPreview(){
    disposePack2Node(lobbyAvatarPreviewRoot);
    lobbyAvatarPreviewRoot=new BABYLON.TransformNode("lobbyAvatarPreviewRoot",scene);
    lobbyAvatarPreviewRoot.position.set(32.4,.05,-9.0);

    const bodyMat=mkMat("previewBodyMat"+Math.random(),potatoRgbHex(gameState.potatoRGB));
    const darkMat=mkMat("previewDarkMat"+Math.random(),"#4b3428");

    const body=BABYLON.MeshBuilder.CreateSphere("previewBody",{diameter:1.0,segments:16},scene);
    body.parent=lobbyAvatarPreviewRoot;body.position.y=.95;body.scaling.set(.78,1.02,.68);body.material=bodyMat;

    const head=BABYLON.MeshBuilder.CreateSphere("previewHead",{diameter:.60,segments:14},scene);
    head.parent=lobbyAvatarPreviewRoot;head.position.set(0,1.58,.02);head.material=bodyMat;

    funnyPotatoFaceParts(head,"previewFunny");

    for(const sx of [-1,1]){
      const hand=BABYLON.MeshBuilder.CreateSphere("previewHand"+sx,{diameter:.20,segments:10},scene);
      hand.parent=lobbyAvatarPreviewRoot;hand.position.set(.54*sx,1.04,.02);hand.material=bodyMat;
      const foot=BABYLON.MeshBuilder.CreateSphere("previewFoot"+sx,{diameter:.18,segments:10},scene);
      foot.parent=lobbyAvatarPreviewRoot;foot.position.set(.18*sx,.34,.05);foot.scaling.z=.72;foot.material=darkMat;
    }

    const butt=addAvatarButtRig(lobbyAvatarPreviewRoot,bodyMat,"preview");
    butt.buttL.position.set(-.17,.70,-.34);
    butt.buttR.position.set(.17,.70,-.34);
    butt.buttL.scaling.set(1.04,1.02,1.22);
    butt.buttR.scaling.set(1.04,1.02,1.22);

    const eq=gameState.equippedCosmetics||{};
    if(eq.head){
      const hat=BABYLON.MeshBuilder.CreateCylinder("previewHat",{diameterTop:.22,diameterBottom:.34,height:.18,tessellation:16},scene);
      hat.parent=head;hat.position.set(0,.34,0);hat.material=darkMat;
      const brim=BABYLON.MeshBuilder.CreateCylinder("previewHatBrim",{diameter:.48,height:.03,tessellation:18},scene);
      brim.parent=head;brim.position.set(0,.26,0);brim.material=darkMat;
    }
    if(eq.face){
      const frame=mkMat("previewGlassFrame","#101010");
      for(const sx of [-1,1]){
        const lens=BABYLON.MeshBuilder.CreateTorus("previewLens"+sx,{diameter:.17,thickness:.018,tessellation:18},scene);
        lens.parent=head;lens.position.set(.12*sx,.055,.27);lens.rotation.x=Math.PI*.5;lens.material=frame;
      }
      const bridge=BABYLON.MeshBuilder.CreateBox("previewGlassBridge",{width:.06,height:.02,depth:.02},scene);
      bridge.parent=head;bridge.position.set(0,.055,.27);bridge.material=frame;
    }
    if(eq.chest){
      const tie=BABYLON.MeshBuilder.CreateCylinder("previewTie",{diameterTop:.05,diameterBottom:.10,height:.26,tessellation:4},scene);
      tie.parent=lobbyAvatarPreviewRoot;tie.position.set(0,1.14,.34);tie.rotation.z=Math.PI*.25;tie.material=darkMat;
    }
    if(eq.back){
      const backpack=BABYLON.MeshBuilder.CreateBox("previewBackpack",{width:.36,height:.42,depth:.16},scene);
      backpack.parent=lobbyAvatarPreviewRoot;backpack.position.set(0,.96,-.39);backpack.material=darkMat;
    }

    const bat=selectedBatData();
    const batMesh=BABYLON.MeshBuilder.CreateCylinder("previewBat"+Math.random(),{height:.92,diameterTop:.055,diameterBottom:.10,tessellation:12},scene);
    batMesh.parent=lobbyAvatarPreviewRoot;
    const side=batHandSide()==="left"?-1:1;
    batMesh.position.set(.58*side,1.06,.02);batMesh.rotation.z=side>0?-.22:.22;
    batMesh.material=mkMat("previewBatMat"+Math.random(),bat.color||"#8b5a2b");
  }

  function showAvatarPreview(on){
    if(!on){lobbyAvatarPreviewRoot?.setEnabled?.(false);return;}
    buildAvatarPreview();
    lobbyAvatarPreviewRoot.setEnabled(true);
  }

  function lobbyAvatarPreview(){
    showAvatarPreview(true);
    const skin=SKIN_CATALOG.find(x=>x.id===gameState.selectedSkin)||SKIN_CATALOG[0];
    return `AVATAR PREVIEW\n\nRGB: ${gameState.potatoRGB.r} ${gameState.potatoRGB.g} ${gameState.potatoRGB.b}\nSKIN: ${skin.name}\nBAT: ${selectedBatData().name}\nBAT HAND: ${batHandSide().toUpperCase()}\n\nEquipped cosmetics are shown.\nTrigger = spin ON/OFF\nGrip = back`;
  }

  function buildBatPreview(){
    disposePack2Node(lobbyBatPreviewRoot);
    lobbyBatPreviewRoot=new BABYLON.TransformNode("lobbyBatPreviewRoot",scene);
    lobbyBatPreviewRoot.position.set(29.0,1.05,-9.0);
    const bat=selectedBatData();
    const mesh=BABYLON.MeshBuilder.CreateCylinder("inspectBatMesh",{height:1.22,diameterTop:.06,diameterBottom:.13,tessellation:16},scene);
    mesh.parent=lobbyBatPreviewRoot;mesh.rotation.z=Math.PI/2;
    mesh.material=mkMat("inspectBatMat"+Math.random(),bat.color||"#8b5a2b");
  }

  function showBatPreview(on){
    if(!on){lobbyBatPreviewRoot?.setEnabled?.(false);return;}
    buildBatPreview();
    lobbyBatPreviewRoot.setEnabled(true);
  }

  function lobbyBatInspect(){
    showBatPreview(true);
    const bat=selectedBatData(),state=selectedBatState();
    return `BAT INSPECT\n\n${bat.name}\n${bat.rarity} • LEVEL ${state.level}/50\nABILITY: ${bat.ability||"Impact"}\nCOPIES: ${state.count||1}\n\nTrigger = next owned bat\nGrip = back`;
  }

  function buildPracticeDummy(){
    disposePack2Node(practiceDummy?.root);
    const root=new BABYLON.TransformNode("practiceDummyRoot",scene);
    root.position.set(26.7,0,-8.5);
    const normal=mkMat("practiceDummyNormal","#d39a65");
    const flash=mkMat("practiceDummyFlash","#fff0a0");

    const body=BABYLON.MeshBuilder.CreateCapsule("practiceDummyBody",{height:1.15,radius:.27,tessellation:14},scene);
    body.parent=root;body.position.y=.86;body.material=normal;
    const head=BABYLON.MeshBuilder.CreateSphere("practiceDummyHead",{diameter:.50,segments:14},scene);
    head.parent=root;head.position.y=1.62;head.material=normal;
    const base=BABYLON.MeshBuilder.CreateCylinder("practiceDummyBase",{height:.14,diameter:.76,tessellation:16},scene);
    base.parent=root;base.position.y=.07;base.material=darkTrimMat;

    practiceDummy={root,body,head,normal,flash};
    practiceDummyHitFlash=0;
    practiceDummyLastHit=0;
  }

  function showPracticeDummy(on){
    if(!on){practiceDummy?.root?.setEnabled?.(false);return;}
    if(!practiceDummy?.root||practiceDummy.root.isDisposed?.())buildPracticeDummy();
    practiceDummy.root.setEnabled(true);
  }

  function lobbyPractice(){
    showPracticeDummy(true);
    return `PRACTICE DUMMY\n\nLAST HIT: ${practiceDummyLastHit.toFixed(1)} m/s\nBEST HIT: ${practiceDummyBestHit.toFixed(1)} m/s\n\nHit the dummy to test swing power.\nGrip = back`;
  }

  function hitPracticeDummySweep(prevTip,tip,base,speed){
    if(gameMode!=="lobby"||lobbySub!=="practice"||!practiceDummy?.root?.isEnabled?.())return false;
    const targets=[
      practiceDummy.root.position.add(new BABYLON.Vector3(0,1.62,0)),
      practiceDummy.root.position.add(new BABYLON.Vector3(0,.95,0))
    ];
    for(const target of targets){
      const d=Math.min(pointSegmentDistance(target,prevTip,tip),pointSegmentDistance(target,base,tip));
      if(d<.34){
        practiceDummyLastHit=Math.max(0,speed);
        practiceDummyBestHit=Math.max(practiceDummyBestHit,practiceDummyLastHit);
        practiceDummyHitFlash=.14;
        practiceDummy.body.material=practiceDummy.flash;
        practiceDummy.head.material=practiceDummy.flash;
        pulse(batHand(),Math.min(1,.2+speed*.08),40+Math.min(80,speed*6));
        playImpactSound("body",Math.min(1,.35+speed*.05));
        lastLobbyMessage=`HIT ${practiceDummyLastHit.toFixed(1)} m/s`;
        refreshLobby();
        return true;
      }
    }
    return false;
  }

  function updatePack2(dt){
    if(lobbyAvatarPreviewRoot?.isEnabled?.()&&gameState.settings.previewSpin!==false)lobbyAvatarPreviewRoot.rotation.y+=dt*.55;
    if(lobbyBatPreviewRoot?.isEnabled?.())lobbyBatPreviewRoot.rotation.y+=dt*.72;
    if(practiceDummy){
      practiceDummyHitFlash=Math.max(0,practiceDummyHitFlash-dt);
      if(practiceDummyHitFlash<=0){
        practiceDummy.body.material=practiceDummy.normal;
        practiceDummy.head.material=practiceDummy.normal;
      }
    }
  }

  function hidePack2(){
    showAvatarPreview(false);showBatPreview(false);showPracticeDummy(false);
  }

  function npcDifficultyMul(){
    const d=gameState.settings.npcDifficulty||"NORMAL";
    if(d==="CHILL")return {speed:.82,attack:.76,damage:.72,anger:.75};
    if(d==="CRAZY")return {speed:1.18,attack:1.22,damage:1.20,anger:1.30};
    return {speed:1,attack:1,damage:1,anger:1};
  }

  function lobbyDifficulty(){
    const d=gameState.settings.npcDifficulty||"NORMAL";
    return `NPC DIFFICULTY\n\n▶ ${d}\n\nCHILL = slower + easier\nNORMAL = balanced\nCRAZY = faster + harder hits\n\nTrigger = next\nGrip = back`;
  }

  function cycleNpcDifficulty(){
    const vals=["CHILL","NORMAL","CRAZY"];
    const cur=gameState.settings.npcDifficulty||"NORMAL";
    gameState.settings.npcDifficulty=vals[(vals.indexOf(cur)+1)%vals.length];
    saveGame();
    if(net.isHost&&net.connected){resetNetworkReady();broadcast(currentLobbyState());}
  }

  function lobbyHandCalibration(){
    const pct=Math.round((gameState.settings.handReach||1)*100);
    return `HAND CALIBRATION\n\nREACH SCALE: ${pct}%\n\nTrigger = +5%\nRange: 85%–115%\n\nUse this if your virtual reach feels too short or too long.\nGrip = back`;
  }

  function cycleHandCalibration(){
    let v=Number(gameState.settings.handReach)||1;
    v=Math.round((v+.05)*100)/100;
    if(v>1.15)v=.85;
    gameState.settings.handReach=v;saveGame();
  }

  function lobbyHolster(){
    return `BAT HOLSTER\n\n${gameState.settings.holsterEnabled?"ENABLED":"DISABLED"}\n\nPress the bat-hand secondary button near your body to holster/draw.\nTrigger = toggle setting\nGrip = back`;
  }

  function controlRowsText(includeStart=false){
    const rows=[
      `BAT HAND: ${batHandSide().toUpperCase()}`,
      `DOMINANT HAND: ${dominantHandSide().toUpperCase()}`,
      `MENU HAND: ${menuHandSide().toUpperCase()}`
    ];
    if(includeStart)rows.push("START MATCH");
    return rows;
  }

  function lobbyControls(){
    const rows=controlRowsText(false);
    let t=`CONTROL SETUP\n\n`;
    rows.forEach((x,i)=>t+=`${i===lobbyIndex?"▶ ":"   "}${x}\n`);
    t+=`\nStick = choose • Trigger = switch\nGrip = back\n\nSaved automatically.`;
    return t;
  }

  function lobbyPrematch(){
    const rows=controlRowsText(true);
    let t=`PRE-MATCH SETUP\n\nMAP: ${gameState.selectedMap.toUpperCase()}\nMODE: ${gameState.mode}\nDIFFICULTY: ${gameState.settings.npcDifficulty}\n\n`;
    rows.forEach((x,i)=>t+=`${i===lobbyIndex?"▶ ":"   "}${x}\n`);
    t+=`\nChoose your hands, then START MATCH.\nGrip = back`;
    return t;
  }

  function lobbySettings(){
    const opts=[
      `MUSIC: ${volumePct(gameState.settings.musicVolume)}`,
      `CHAT: ${volumePct(gameState.settings.chatVolume)}`,
      `SOUND EFFECTS: ${volumePct(gameState.settings.sfxVolume)}`,
      `CAMERA: ${cameraHeld?"ON":"OFF"}`,
      "TRAINING AREA"
    ];
    return `AUDIO / CAMERA\n\n${opts.map((x,j)=>(j===lobbyIndex?"▶ ":"   ")+x).join("\n")}\n\nStick = choose • Trigger = change/select • Grip = back`;
  }
  function lobbyOnline(kind){
    if(kind.startsWith("MULTIPLAYER"))return lobbyMultiplayer();
    return `${kind}\n\nTrading still needs account/backend support.\n\nGrip = back`;
  }

  // ------------------------------------------------------------
  // REAL 1–4 PLAYER P2P TEST MULTIPLAYER
  // Host accepts up to 3 guests. Guests connect only to host.
  // Host is authoritative for NPC/map progression and relays remote poses.
  // ------------------------------------------------------------
  const net={
    peer:null,connections:new Map(),hostConn:null,connected:false,isHost:false,code:"",
    status:"OFFLINE",ready:false,lastSend:0,lastRecv:0,
    playerId:"p"+Math.random().toString(36).slice(2,8),
    players:new Map(),maxPlayers:8,reviveCooldown:0,hitCooldown:0,lastLobbySync:0,matchMembers:new Set(),
    publicMode:false,publicSlot:-1,publicSearching:false,publicToken:0
  };
  let multiDigits=[0,0,0,0,0];

  const netCode=()=>multiDigits.join("");
  const v3arr=v=>v?[v.x,v.y,v.z]:null;
  const qarr=q=>q?[q.x,q.y,q.z,q.w]:null;
  const arrv=a=>Array.isArray(a)&&a.length>=3?new BABYLON.Vector3(a[0],a[1],a[2]):null;
  const arrq=a=>Array.isArray(a)&&a.length>=4?new BABYLON.Quaternion(a[0],a[1],a[2],a[3]):null;

  function netPlayerCount(){
    if(net.isHost)return 1+[...net.connections.values()].filter(c=>c?.open).length;
    return net.connected?Math.max(2,Math.min(8,gameState.partySize||2)):1;
  }

  function sendConn(conn,d){
    try{if(conn?.open)conn.send(d);}catch(_){}
  }
  function sendHost(d){
    if(net.isHost)return;
    sendConn(net.hostConn,d);
  }
  function broadcast(d,exceptPeerId=null){
    if(!net.isHost)return;
    for(const [pid,c] of net.connections){
      if(pid!==exceptPeerId)sendConn(c,d);
    }
  }

  function broadcastMatch(d,exceptPeerId=null){
    if(!net.isHost)return;
    for(const pid of net.matchMembers){
      if(pid===exceptPeerId)continue;
      sendConn(net.connections.get(pid),d);
    }
  }

  function broadcastWaitingLobby(d,exceptPeerId=null){
    if(!net.isHost)return;
    for(const [pid,c] of net.connections){
      if(pid===exceptPeerId||!c?.open||net.matchMembers.has(pid))continue;
      sendConn(c,d);
    }
  }

  function isWaitingLobbyPlayer(pid){
    const p=net.players.get(pid);
    return !!net.connections.get(pid)?.open&&!net.matchMembers.has(pid)&&!p?.reportedInMatch;
  }

  const remoteMats=[
    mkMat("remotePotatoMat1","#c98b4a"),
    mkMat("remotePotatoMat2","#7f9fd4"),
    mkMat("remotePotatoMat3","#87b96b")
  ];
  const remoteDark=mkMat("remoteDark","#5e3b24");

  function makeRemoteAvatar(slot){
    const root=new BABYLON.TransformNode("remotePlayerRoot"+slot,scene);
    const avatarMat=remoteMats[slot%remoteMats.length].clone("remoteAvatarMatClone"+slot);
    const darkMat=mkMat("remoteAvatarDark"+slot,"#4b3428");

    const head=BABYLON.MeshBuilder.CreateSphere("remoteHead"+slot,{diameter:.28,segments:12},scene);
    head.parent=root;head.material=avatarMat;

    const chest=BABYLON.MeshBuilder.CreateSphere("remoteChest"+slot,{diameter:.48,segments:14},scene);
    chest.parent=root;chest.scaling.set(.78,1,.68);chest.material=avatarMat;

    const left=BABYLON.MeshBuilder.CreateSphere("remoteLeftHand"+slot,{diameter:.17,segments:10},scene);
    left.parent=root;left.material=avatarMat;
    const right=BABYLON.MeshBuilder.CreateSphere("remoteRightHand"+slot,{diameter:.17,segments:10},scene);
    right.parent=root;right.material=avatarMat;

    const bat=BABYLON.MeshBuilder.CreateCylinder("remoteBat"+slot,{height:.92,diameterTop:.055,diameterBottom:.085,tessellation:12},scene);
    bat.parent=root;bat.material=remoteDark;

    const face=funnyPotatoFaceParts(head,"remoteFace"+slot);
    const butt=addAvatarButtRig(root,avatarMat,"remote"+slot);

    const ownerVisuals={};
    {
      const cyan=mkMat("remoteOwnerCyan"+slot,"#20e7ff");
      const pink=mkMat("remoteOwnerPink"+slot,"#ff46df");
      const dark=mkMat("remoteOwnerDark"+slot,"#090b16");
      cyan.emissiveColor=BABYLON.Color3.FromHexString("#20e7ff").scale(.75);
      pink.emissiveColor=BABYLON.Color3.FromHexString("#ff46df").scale(.70);

      const crown=new BABYLON.TransformNode("remoteOwnerCrown"+slot,scene);
      crown.parent=head;
      const ring=BABYLON.MeshBuilder.CreateTorus("remoteOwnerCrownRing"+slot,{diameter:.27,thickness:.025,tessellation:18},scene);
      ring.parent=crown;ring.position.set(0,.21,0);ring.rotation.x=Math.PI/2;ring.material=cyan;
      for(let i=0;i<5;i++){
        const s=BABYLON.MeshBuilder.CreateCylinder("remoteOwnerSpike"+slot+"_"+i,{height:.12,diameterTop:0,diameterBottom:.045,tessellation:5},scene);
        const a=i/5*Math.PI*2;s.parent=crown;s.position.set(Math.cos(a)*.09,.29,Math.sin(a)*.09);s.material=i%2?pink:cyan;
      }
      crown.setEnabled(false);ownerVisuals.ownerCrown=crown;

      const visor=new BABYLON.TransformNode("remoteOwnerVisor"+slot,scene);visor.parent=head;
      const vb=BABYLON.MeshBuilder.CreateBox("remoteOwnerVisorBody"+slot,{width:.25,height:.06,depth:.035},scene);
      vb.parent=visor;vb.position.set(0,.02,.15);vb.material=dark;
      const vg=BABYLON.MeshBuilder.CreateBox("remoteOwnerVisorGlow"+slot,{width:.21,height:.018,depth:.012},scene);
      vg.parent=visor;vg.position.set(0,.02,.173);vg.material=pink;
      visor.setEnabled(false);ownerVisuals.ownerVisor=visor;

      const core=new BABYLON.TransformNode("remoteOwnerCore"+slot,scene);core.parent=chest;
      const cor=BABYLON.MeshBuilder.CreateTorus("remoteOwnerCoreRing"+slot,{diameter:.18,thickness:.025,tessellation:18},scene);
      cor.parent=core;cor.position.set(0,.08,.26);cor.rotation.x=Math.PI/2;cor.material=cyan;
      core.setEnabled(false);ownerVisuals.ownerCore=core;

      const cape=new BABYLON.TransformNode("remoteOwnerCape"+slot,scene);cape.parent=chest;
      const cp=BABYLON.MeshBuilder.CreateBox("remoteOwnerCapeBody"+slot,{width:.36,height:.45,depth:.025},scene);
      cp.parent=cape;cp.position.set(0,-.09,-.29);cp.material=dark;
      const ce=BABYLON.MeshBuilder.CreateBox("remoteOwnerCapeEdge"+slot,{width:.30,height:.025,depth:.012},scene);
      ce.parent=cape;ce.position.set(0,.06,-.305);ce.material=pink;
      cape.setEnabled(false);ownerVisuals.ownerCape=cape;
    }

    root.setEnabled(false);
    return {
      root,head,chest,left,right,bat,slot,pose:null,hp:100,downed:false,dead:false,ready:false,lastRecv:0,
      targetHead:null,targetHeadRot:null,targetLeft:null,targetRight:null,targetBatPos:null,targetBatRot:null,targetDowned:false,
      buttL:butt.buttL,buttR:butt.buttR,printPlane:butt.printPlane,floatHand:butt.floatHand,
      face,buttJiggle:0,buttJiggleTimer:0,slapPrintTimer:0,slapFloatTimer:0,slapPrintSide:1,
      handSlapTimer:0,handSlapSide:"right",handSlapKick:0,faceReactTimer:0,
      talking:false,talkLevel:0,ownerVisuals
    };
  }

  const remoteAvatars=[0,1,2,3,4,5,6].map(makeRemoteAvatar);
  remoteAvatars.forEach(a=>{a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);a.root.scaling.set(1,1,1);});

  function avatarForPlayer(id){
    const p=net.players.get(id);
    if(p?.avatar)return p.avatar;
    const used=new Set([...net.players.values()].map(x=>x.avatar?.slot).filter(x=>x!==undefined));
    const av=remoteAvatars.find(a=>!used.has(a.slot));
    if(!av)return null;
    const entry=p||{};
    av.talking=false;av.talkLevel=0;av.faceReactTimer=0;av.buttJiggle=0;av.buttJiggleTimer=0;
    for(const id of OWNER_COSMETIC_IDS)av.ownerVisuals?.[id]?.setEnabled?.(false);
    entry.avatar=av;entry.ready=!!entry.ready;entry.lastRecv=performance.now();
    net.players.set(id,entry);
    return av;
  }

  function hidePlayerAvatar(id){
    const p=net.players.get(id);
    if(p?.avatar){
      p.avatar.root.setEnabled(false);p.avatar.bat?.setEnabled?.(false);
      p.avatar.pose=null;
      p.avatar.targetHead=null;p.avatar.targetHeadRot=null;p.avatar.targetLeft=null;p.avatar.targetRight=null;
      p.avatar.targetBatPos=null;p.avatar.targetBatRot=null;p.avatar.targetDowned=false;
      p.avatar.slapPrintTimer=0;p.avatar.slapFloatTimer=0;p.avatar.handSlapTimer=0;p.avatar.faceReactTimer=0;p.avatar.talking=false;p.avatar.talkLevel=0;p.avatar.buttJiggleTimer=0;
      p.avatar.printPlane?.setEnabled?.(false);p.avatar.floatHand?.setEnabled?.(false);
      for(const id of OWNER_COSMETIC_IDS)p.avatar.ownerVisuals?.[id]?.setEnabled?.(false);
    }
  }

  function setRemotePose(id,d){
    const av=avatarForPlayer(id);if(!av)return;
    const entry=net.players.get(id);
    entry.pose=d;entry.hp=d.hp??100;entry.downed=!!d.downed;entry.dead=!!d.dead;entry.lastRecv=performance.now();
    av.pose=d;av.hp=entry.hp;av.downed=entry.downed;av.dead=entry.dead;av.lastRecv=entry.lastRecv;
    av.talking=!!d.talking;
    const remoteOwnerCosmetics=Array.isArray(d.ownerCosmetics)?d.ownerCosmetics:[];
    for(const id of OWNER_COSMETIC_IDS)av.ownerVisuals?.[id]?.setEnabled?.(remoteOwnerCosmetics.includes(id));
    if(d.color&&typeof d.color==="object"){
      const cc=BABYLON.Color3.FromHexString(potatoRgbHex(d.color));
      if(av.head?.material)av.head.material.diffuseColor=cc;
    }

    if(!d.head||entry.dead){
      av.root.setEnabled(false);av.bat.setEnabled(false);
      av.targetHead=null;av.targetHeadRot=null;av.targetLeft=null;av.targetRight=null;
      av.targetBatPos=null;av.targetBatRot=null;av.targetDowned=false;
      return;
    }
    const allowedHere=gameMode==="lobby"||net.matchMembers.has(id)||(id==="host"&&net.matchMembers.has("host"));
    av.root.setEnabled((net.connected||net.isHost)&&allowedHere);
    if(!allowedHere)return;
    const h=arrv(d.head),hq=arrq(d.headRot),l=arrv(d.left),r=arrv(d.right),bp=arrv(d.batPos),bq=arrq(d.batRot);
    if(bp)av.bat.setEnabled(true);
    av.targetHead=h;av.targetHeadRot=hq;av.targetLeft=l;av.targetRight=r;av.targetBatPos=bp;av.targetBatRot=bq;
    av.bat.setEnabled(!!bp&&d.batVisible!==false&&!d.batHolstered);
    av.targetDowned=entry.downed;
  }

  function clearRemotePlayers(){
    for(const av of remoteAvatars){
      av.root.setEnabled(false);av.pose=null;av.targetHead=null;av.targetHeadRot=null;av.targetLeft=null;av.targetRight=null;
      av.targetBatPos=null;av.targetBatRot=null;av.targetDowned=false;
      av.slapPrintTimer=0;av.slapFloatTimer=0;av.handSlapTimer=0;av.faceReactTimer=0;av.talking=false;av.talkLevel=0;av.buttJiggleTimer=0;
      av.printPlane?.setEnabled?.(false);av.floatHand?.setEnabled?.(false);
      for(const id of OWNER_COSMETIC_IDS)av.ownerVisuals?.[id]?.setEnabled?.(false);
    }
    net.players.clear();
  }

  function destroyNetwork(silent=false){
    const staleGiftDropId=ownerGiftState?.dropId||0;
    ownerGiftState={active:false,id:null,dropId:staleGiftDropId,ownerId:null,claimed:new Set()};
    disposeOwnerGiftVisual();
    try{
      if(net.isHost){
        for(const c of net.connections.values())try{c.close();}catch(_){}
      }else try{net.hostConn?.close();}catch(_){}
      try{net.peer?.destroy();}catch(_){}
    }catch(_){}
    net.peer=null;net.connections.clear();net.hostConn=null;net.connected=false;net.isHost=false;net.code="";net.matchMembers.clear();
    net.publicSearching=false;net.publicMode=false;net.publicSlot=-1;net.publicToken++;
    net.ready=false;net.status="OFFLINE";net.lastRecv=0;net.lastSend=0;net.lastLobbySync=0;net.blockCooldown=0;clearRemotePlayers();
    gameState.partySize=1;saveGame();if(!silent)refreshLobby();
  }

  function resetNetworkReady(){
    net.ready=false;
    if(net.isHost){
      for(const [id,p] of net.players){
        p.ready=false;
        net.players.set(id,p);
      }
      if(net.connected)broadcast({t:"resetReady"});
    }
  }

  function currentLobbyState(){
    return {
      t:"lobby",
      map:gameState.selectedMap,
      mode:gameState.mode,
      difficulty:gameState.settings.npcDifficulty,
      players:netPlayerCount(),
      gift:ownerGiftState.active?{id:ownerGiftState.id,dropId:ownerGiftState.dropId,ownerId:ownerGiftState.ownerId}:null,
      ready:[...net.players.entries()].filter(([,p])=>p?.ready).map(([id])=>id)
    };
  }

  function bindHostSideConnection(conn){
    const pid=conn.peer;

    conn.on("open",()=>{
      if(net.connections.has(pid)){
        sendConn(conn,{t:"duplicate"});
        setTimeout(()=>{try{conn.close();}catch(_){}},100);
        return;
      }
      if([...net.connections.values()].filter(c=>c?.open).length>=7){
        sendConn(conn,{t:"full",max:8});
        setTimeout(()=>{try{conn.close();}catch(_){}},100);
        return;
      }

      net.connections.set(pid,conn);
      const av=avatarForPlayer(pid);
      const joined=net.players.get(pid)||{};
      joined.ready=false;joined.inMatch=false;joined.reportedInMatch=false;joined.avatar=av;joined.lastRecv=performance.now();
      net.players.set(pid,joined);
      net.connected=true;gameState.partySize=Math.min(8,netPlayerCount());
      saveGame();

      sendConn(conn,{t:"welcome",id:pid,players:netPlayerCount(),hostId:net.playerId});
      sendConn(conn,currentLobbyState());
      broadcast({t:"playerCount",count:netPlayerCount()});
      net.status=`PUBLIC LOBBY • ${netPlayerCount()}/8`;
      refreshLobby();
    });

    conn.on("data",d=>handleHostMessage(pid,d));
    conn.on("close",()=>{
      if(!net.isHost||!net.peer||!net.connections.has(pid))return;
      hidePlayerAvatar(pid);
      net.connections.delete(pid);
      net.matchMembers.delete(pid);
      const gone=net.players.get(pid);if(gone)gone.ready=false;
      net.players.delete(pid);
      if(ownerGiftState.active&&ownerGiftState.ownerId===pid)clearOwnerGiftDrop();
      if(gameMode==="lobby")gameState.partySize=Math.max(1,Math.min(8,netPlayerCount()));
      else gameState.partySize=Math.max(1,Math.min(4,1+[...net.matchMembers].filter(id=>net.connections.get(id)?.open).length));
      net.connected=[...net.connections.values()].some(c=>c?.open);
      net.status=gameMode==="lobby"?(net.connected?`PUBLIC LOBBY • ${netPlayerCount()}/8`:"PUBLIC LOBBY • WAITING"):`MATCH • ${gameState.partySize}/4`;
      broadcast({t:"playerLeft",id:pid});
      broadcast({t:"playerCount",count:netPlayerCount()});
      saveGame();refreshLobby();
    });
    conn.on("error",()=>{net.status="A PLAYER CONNECTION ERRORED";refreshLobby();});
  }

  function bindGuestConnection(conn){
    net.hostConn=conn;net.status="CONNECTING";refreshLobby();
    let opened=false,closingHandled=false;
    const finishOpen=()=>{
      if(opened)return;
      opened=true;
      net.connected=true;gameState.partySize=2;
      net.status=net.publicMode?"PUBLIC • CONNECTED":"CONNECTED";
      sendHost({t:"hello",id:net.playerId,bat:gameState.selectedBat,skin:gameState.selectedSkin,color:gameState.potatoRGB,ownerGiftAccess:!!OWNER_ACCESS});
      saveGame();refreshLobby();
    };
    const recoverPublic=()=>{
      if(closingHandled)return;
      closingHandled=true;
      const wasPublic=net.publicMode;
      const wasMap=gameMode==="map";
      net.connected=false;net.ready=false;net.hostConn=null;net.matchMembers.clear();
      gameState.partySize=1;clearRemotePlayers();
      try{net.peer?.destroy();}catch(_){}
      net.peer=null;saveGame();
      if(wasMap)goLobby(true);else refreshLobby();
      if(wasPublic)setTimeout(()=>ensurePublicLobby(),220);
    };
    conn.on("open",finishOpen);
    conn.on("data",handleGuestMessage);
    conn.on("close",()=>{
      if(!net.peer&&!net.hostConn)return;
      if(!["ROOM FULL (8/8)","ALREADY CONNECTED","OFFLINE","HOST LEFT"].includes(net.status))net.status="HOST DISCONNECTED";
      recoverPublic();
    });
    conn.on("error",()=>{
      net.status="CONNECTION ERROR";
      try{net.hostConn?.close();}catch(_){}
      recoverPublic();
    });
    if(conn.open)finishOpen();
  }

  const PUBLIC_POOL_SIZE=16;
  function publicPeerId(slot){return "vrbb-public-"+slot;}

  function createPublicRoom(slot,attempt=0){
    if(typeof Peer==="undefined"){net.status="NETWORK LIBRARY FAILED";refreshLobby();return;}
    destroyNetwork(true);
    net.publicMode=true;net.publicSlot=slot;net.status="CREATING PUBLIC ROOM";
    try{
      net.peer=new Peer(publicPeerId(slot));
      net.peer.on("open",()=>{
        net.isHost=true;net.connected=false;net.code="PUBLIC";
        net.status="PUBLIC • WAITING FOR PLAYERS";
        net.peer.on("connection",conn=>bindHostSideConnection(conn));
        refreshLobby();
      });
      net.peer.on("error",err=>{
        try{net.peer?.destroy();}catch(_){}
        net.peer=null;
        if(err?.type==="unavailable-id"&&attempt<PUBLIC_POOL_SIZE-1){
          setTimeout(()=>createPublicRoom((slot+1)%PUBLIC_POOL_SIZE,attempt+1),80);
          return;
        }
        net.status=err?.type==="unavailable-id"?"PUBLIC ROOMS BUSY — TRY AGAIN":"PUBLIC NETWORK ERROR";
        refreshLobby();
      });
    }catch(_){net.status="PUBLIC NETWORK ERROR";refreshLobby();}
  }

  function joinPublicMatch(){
    if(typeof Peer==="undefined"){net.status="NETWORK LIBRARY FAILED";refreshLobby();return;}
    destroyNetwork(true);
    net.publicMode=true;net.publicSearching=true;net.status="SEARCHING PUBLIC MATCH";refreshLobby();
    const token=++net.publicToken;
    const order=[...Array(PUBLIC_POOL_SIZE).keys()].sort(()=>Math.random()-.5);

    const tryIndex=(i)=>{
      if(token!==net.publicToken||!net.publicSearching)return;
      if(i>=order.length){
        net.publicSearching=false;
        createPublicRoom(order[Math.floor(Math.random()*order.length)]);
        return;
      }

      const slot=order[i];
      net.status=`SEARCHING PUBLIC • ${i+1}/${PUBLIC_POOL_SIZE}`;refreshLobby();
      let tempPeer=null,conn=null,finished=false;
      const fail=()=>{
        if(finished)return;
        finished=true;
        try{conn?.close();}catch(_){}
        try{tempPeer?.destroy();}catch(_){}
        setTimeout(()=>tryIndex(i+1),80);
      };

      try{
        tempPeer=new Peer();
        const timer=setTimeout(fail,950);
        tempPeer.on("open",()=>{
          conn=tempPeer.connect(publicPeerId(slot),{reliable:true});
          conn.on("open",()=>{
            if(finished)return;
            finished=true;clearTimeout(timer);
            net.peer=tempPeer;net.publicMode=true;net.publicSlot=slot;net.publicSearching=false;
            net.status="PUBLIC • CONNECTED";
            bindGuestConnection(conn);
          });
          conn.on("error",fail);
        });
        tempPeer.on("error",fail);
      }catch(_){fail();}
    };

    tryIndex(0);
  }

  function createRoom(){
    if(typeof Peer==="undefined"){net.status="NETWORK LIBRARY FAILED";refreshLobby();return;}
    destroyNetwork(true);
    net.publicMode=false;net.publicSlot=-1;
    net.isHost=true;net.code=String(Math.floor(10000+Math.random()*90000));
    multiDigits=net.code.split("").map(Number);
    net.status="CREATING";
    const peerId="vrbb-"+net.code;
    try{
      net.peer=new Peer(peerId);
      net.peer.on("open",()=>{net.status="PUBLIC LOBBY • WAITING • 1/8";refreshLobby();});
      net.peer.on("connection",conn=>bindHostSideConnection(conn));
      net.peer.on("error",err=>{
        if(err?.type==="unavailable-id"){
          net.status="CODE BUSY — CREATE AGAIN";
          try{net.peer.destroy();}catch(_){}
          net.peer=null;
        }else net.status="NETWORK ERROR";
        refreshLobby();
      });
    }catch(_){net.status="NETWORK ERROR";refreshLobby();}
  }

  function joinRoom(){
    const code=netCode();
    if(!/^\d{5}$/.test(code)||code==="00000"){net.status="SET A 5-DIGIT CODE";refreshLobby();return;}
    if(typeof Peer==="undefined"){net.status="NETWORK LIBRARY FAILED";refreshLobby();return;}
    destroyNetwork(true);
    net.publicMode=false;net.publicSlot=-1;
    multiDigits=code.split("").map(Number);
    net.code=code;net.isHost=false;net.status="JOINING";
    try{
      net.peer=new Peer();
      net.peer.on("open",()=>{
        const conn=net.peer.connect("vrbb-"+code,{reliable:true});
        bindGuestConnection(conn);
      });
      net.peer.on("error",()=>{
        net.status="ROOM NOT FOUND / NETWORK ERROR";net.connected=false;net.ready=false;gameState.partySize=1;
        try{net.hostConn?.close();}catch(_){}
        net.hostConn=null;
        try{net.peer?.destroy();}catch(_){}
        net.peer=null;
        clearRemotePlayers();saveGame();refreshLobby();
      });
    }catch(_){net.status="NETWORK ERROR";refreshLobby();}
  }

  function poseRearVector(pose){
    const q=arrq(pose?.headRot)||BABYLON.Quaternion.Identity();
    let rear=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,-1),BABYLON.Matrix.FromQuaternion(q));
    rear.y=0;if(rear.lengthSquared()<.0001)rear.set(0,0,-1);
    return rear.normalize();
  }

  function poseButtPoint(pose){
    const head=arrv(pose?.head);if(!head)return null;
    return head.add(new BABYLON.Vector3(0,-.40,0)).add(poseRearVector(pose).scale(.30));
  }

  function localButtPoint(){
    const head=playerWorldPos();
    const q=xrCamera?.absoluteRotationQuaternion||xrCamera?.rotationQuaternion||BABYLON.Quaternion.Identity();
    let rear=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,-1),BABYLON.Matrix.FromQuaternion(q));
    rear.y=0;if(rear.lengthSquared()<.0001)rear.set(0,0,-1);rear.normalize();
    return head.add(new BABYLON.Vector3(0,-.40,0)).add(rear.scale(.30));
  }

  function validateWaitingLobbySlap(pid,d){
    if(!isWaitingLobbyPlayer(pid)||d.target==="host"||!isWaitingLobbyPlayer(d.target))return false;
    const src=net.players.get(pid),target=net.players.get(d.target);
    if(!src?.pose||!target?.pose)return false;
    if(!src.lastPoseRecv||performance.now()-src.lastPoseRecv>650)return false;
    if(!target.lastPoseRecv||performance.now()-target.lastPoseRecv>900)return false;

    const side=d.side==="left"?"left":"right";
    const hand=arrv(src.pose?.[side]);if(!hand)return false;
    const zone=d.zone==="hand"?"hand":"butt";

    if(zone==="butt"){
      const butt=poseButtPoint(target.pose);
      return !!butt&&BABYLON.Vector3.Distance(hand,butt)<.42;
    }
    const targetSide=d.targetSide==="left"?"left":d.targetSide==="right"?"right":null;
    if(!targetSide)return false;
    const targetHand=arrv(target.pose?.[targetSide]);
    return !!targetHand&&BABYLON.Vector3.Distance(hand,targetHand)<.34;
  }

  function validateGuestSlap(pid,d){
    const src=net.players.get(pid);
    if(!src?.pose||!src.lastPoseRecv||performance.now()-src.lastPoseRecv>650)return false;
    const side=d.side==="left"?"left":"right";
    const hand=arrv(src.pose?.[side]);if(!hand)return false;
    const zone=d.zone==="hand"?"hand":"butt";
    if(d.target==="host"){
      if(zone==="butt")return BABYLON.Vector3.Distance(hand,localButtPoint())<.42;
      const targetSide=d.targetSide==="left"?"left":d.targetSide==="right"?"right":null;
      if(!targetSide)return false;
      const targetHand=hands[targetSide]?.node?calibratedHandWorld(hands[targetSide]):null;
      return !!targetHand&&BABYLON.Vector3.Distance(hand,targetHand)<.34;
    }
    const target=net.players.get(d.target);
    if(!target?.pose||target.dead||!target.lastPoseRecv||performance.now()-target.lastPoseRecv>900)return false;
    if(zone==="butt"){
      const butt=poseButtPoint(target.pose);
      return !!butt&&BABYLON.Vector3.Distance(hand,butt)<.42;
    }
    const targetSide=d.targetSide==="left"?"left":d.targetSide==="right"?"right":null;
    if(!targetSide)return false;
    const targetHand=arrv(target.pose?.[targetSide]);
    return !!targetHand&&BABYLON.Vector3.Distance(hand,targetHand)<.34;
  }

  function validateGuestNpcSlap(pid,d){
    const src=net.players.get(pid);
    if(!src?.pose||!src.lastPoseRecv||performance.now()-src.lastPoseRecv>650||!npc||npc.dead)return false;
    const side=d.side==="left"?"left":"right";
    const hand=arrv(src.pose?.[side]);if(!hand)return false;
    const zone=d.zone==="body"?"body":"butt";
    const target=zone==="butt"?npcButtWorldCenter():npcLocalToWorld(new BABYLON.Vector3(0,1.05,0));
    return !!target&&BABYLON.Vector3.Distance(hand,target)<(zone==="butt"?.42:.48);
  }

  function validateRemoteOwnerGiftPickup(pid,dropId){
    if(gameMode==="map"&&net.matchMembers.has(pid))return false;
    if(!ownerGiftState.active||Number(dropId)!==Number(ownerGiftState.dropId))return false;
    const p=net.players.get(pid);
    if(p?.reportedInMatch)return false;
    if(!p?.pose||!p.lastPoseRecv||performance.now()-p.lastPoseRecv>850)return false;
    const left=arrv(p.pose.left),right=arrv(p.pose.right);
    return !!((left&&BABYLON.Vector3.Distance(left,OWNER_GIFT_POSITION)<.48)||(right&&BABYLON.Vector3.Distance(right,OWNER_GIFT_POSITION)<.48));
  }

  function handleHostMessage(pid,d){
    if(!d||typeof d!=="object")return;
    const entry=net.players.get(pid)||{};
    entry.lastRecv=performance.now();net.players.set(pid,entry);

    if(d.t==="hello"){
      entry.ownerGiftAccess=!!d.ownerGiftAccess;
      net.players.set(pid,entry);
      sendConn(net.connections.get(pid),{t:"welcome",players:netPlayerCount()});
      sendConn(net.connections.get(pid),currentLobbyState());
    }else if(d.t==="ready"){
      entry.ready=!!d.value;net.players.set(pid,entry);
      broadcast({t:"readyState",id:pid,value:entry.ready});
      refreshLobby();
    }else if(d.t==="pose"){
      if(!net.connections.get(pid)?.open)return;
      entry.lastPoseRecv=performance.now();
      entry.reportedInMatch=!!d.inMatch;
      net.players.set(pid,entry);
      setRemotePose(pid,d);
      if(gameMode==="map"){
        if(net.matchMembers.has(pid)&&entry.reportedInMatch){
          for(const id of net.matchMembers){if(id!==pid)sendConn(net.connections.get(id),{...d,t:"remotePose",id:pid});}
        }else{
          broadcastWaitingLobby({...d,t:"remotePose",id:pid},pid);
        }
      }else broadcast({...d,t:"remotePose",id:pid},pid);
    }else if(d.t==="hit"&&net.connections.get(pid)?.open&&gameMode==="map"&&net.matchMembers.has(pid)&&entry.reportedInMatch&&npc&&!npc.dead){
      const p=arrv(d.pos),v=arrv(d.vel);
      const remoteEntry=net.players.get(pid);
      const rp=remoteEntry?.pose;
      const rb=arrv(rp?.batPos);
      const poseFresh=!!remoteEntry?.lastPoseRecv&&(performance.now()-remoteEntry.lastPoseRecv)<900;
      const plausible=p&&v&&rb&&poseFresh &&
        BABYLON.Vector3.Distance(p,npc.root.position)<2.4 &&
        BABYLON.Vector3.Distance(p,rb)<1.45;
      if(plausible){
        damageNpc(p,v,Math.max(0,Math.min(12,Number(d.speed)||0)));
      }
    }else if(d.t==="block"&&gameMode==="map"&&net.matchMembers.has(pid)&&entry.reportedInMatch&&npc&&!npc.dead&&net.connections.get(pid)?.open){
      const target=npcCombatTarget();
      const progress=npc.attackDuration>0?BABYLON.Scalar.Clamp(npc.attackAnim/npc.attackDuration,0,1):0;
      if(target?.id===pid&&!target.local&&!npc.attackBlocked&&!npc.attackHasHit&&progress>.16&&progress<.95){
        const wb=npc.weaponPrevBase||npc.weaponBase?.getAbsolutePosition?.();
        const wt=npc.weaponPrevTip||npc.weaponTip?.getAbsolutePosition?.();
        if(wb&&wt&&validateRemoteBlock(pid,wb,wt)){
          npc.attackBlocked=true;npc.attackHasHit=true;npc.attackAnim=0;
          npc.stun=Math.max(npc.stun,.52);
          npc.weaponDurability=Math.max(0,(npc.weaponDurability||1)-1);
          if(npc.weaponDurability<=0)breakNpcWeapon();
          reactNpc("block",1);
          sendConn(net.connections.get(pid),{t:"blockConfirmed"});
        }
      }
    }else if(d.t==="slap"&&typeof d.target==="string"){
      const zone=d.zone==="hand"?"hand":"butt";
      const side=d.side==="left"?"left":"right";
      const targetSide=d.targetSide==="left"?"left":d.targetSide==="right"?"right":null;
      const strength=Math.max(.45,Math.min(1.2,Number(d.strength)||.9));

      if(gameMode==="map"&&isWaitingLobbyPlayer(pid)){
        if(validateWaitingLobbySlap(pid,{...d,zone,side,targetSide})){
          broadcastWaitingLobby({t:"slap",target:d.target,zone,side,targetSide,strength,by:pid});
        }
      }else if(gameMode!=="map"||(net.matchMembers.has(pid)&&entry.reportedInMatch)){
        if((d.target==="host"||net.players.has(d.target))&&validateGuestSlap(pid,{...d,zone,side,targetSide})){
          applySlapToTarget(d.target,zone,side,strength,targetSide);
          if(gameMode==="map")broadcastMatch({t:"slap",target:d.target,zone,side,targetSide,strength,by:pid});
          else broadcast({t:"slap",target:d.target,zone,side,targetSide,strength,by:pid});
        }
      }
    }else if(d.t==="npcSlap"&&gameMode==="map"&&net.matchMembers.has(pid)&&entry.reportedInMatch&&npc&&!npc.dead){
      const zone=d.zone==="body"?"body":"butt";
      const side=d.side==="left"?"left":"right";
      const strength=Math.max(.45,Math.min(1.2,Number(d.strength)||.9));
      if(validateGuestNpcSlap(pid,{...d,zone,side})){
        slapNpc(zone,side,strength);
        broadcastMatch({t:"npcSlap",zone,side,strength,by:pid});
      }
    }else if(d.t==="ownerGiftDropRequest"){
      if(entry.ownerGiftAccess&&!entry.reportedInMatch&&!net.matchMembers.has(pid)&&OWNER_COSMETIC_IDS.includes(d.id)){
        activateOwnerGiftDrop(d.id,pid);
      }
    }else if(d.t==="ownerGiftClaim"&&ownerGiftState.active&&Number(d.dropId)===Number(ownerGiftState.dropId)){
      if(!ownerGiftState.claimed.has(pid)&&validateRemoteOwnerGiftPickup(pid,d.dropId)){
        ownerGiftState.claimed.add(pid);
        sendConn(net.connections.get(pid),{t:"ownerGiftGranted",id:ownerGiftState.id,dropId:ownerGiftState.dropId});
      }
    }else if(d.t==="revive"&&d.target){
      const targetConn=net.connections.get(d.target);
      if(d.target==="host") {
        if(playerDowned)reviveLocalPlayer();
      } else if(targetConn && net.players.get(d.target)?.downed) {
        sendConn(targetConn,{t:"revive"});
      }
    }else if(d.t==="leave"){
      try{net.connections.get(pid)?.close();}catch(_){}
    }
  }

  function handleGuestMessage(d){
    if(!d||typeof d!=="object")return;
    net.lastRecv=performance.now();

    if(d.t==="duplicate"){
      const retryPublic=!!net.publicMode;
      net.status="ALREADY CONNECTED";
      try{net.hostConn?.close();}catch(_){}
      net.hostConn=null;net.connected=false;net.ready=false;gameState.partySize=1;
      clearRemotePlayers();
      try{net.peer?.destroy();}catch(_){}net.peer=null;
      saveGame();
      if(gameMode==="map")goLobby(true);else refreshLobby();
      if(retryPublic&&gameMode!=="map")setTimeout(()=>joinPublicMatch(),160);
    }else if(d.t==="full"){
      const retryPublic=!!net.publicMode;
      net.status="ROOM FULL (8/8)";
      try{net.hostConn?.close();}catch(_){}
      net.hostConn=null;net.connected=false;net.ready=false;gameState.partySize=1;
      clearRemotePlayers();
      try{net.peer?.destroy();}catch(_){}net.peer=null;
      saveGame();
      if(gameMode==="map")goLobby(true);else refreshLobby();
      if(retryPublic&&gameMode!=="map")setTimeout(()=>joinPublicMatch(),160);
    }else if(d.t==="welcome"){
      net.connected=true;
      net.status=`PUBLIC LOBBY • ${d.players||2}/8`;
      gameState.partySize=Math.max(2,Math.min(8,d.players||2));saveGame();refreshLobby();
    }else if(d.t==="playerCount"){
      if(gameMode==="lobby"){
        gameState.partySize=Math.max(1,Math.min(8,d.count||1));
        net.status=`PUBLIC LOBBY • ${gameState.partySize}/8`;
        saveGame();refreshLobby();
      }
    }else if(d.t==="readyState"&&d.id){
      const p=net.players.get(d.id)||{};
      p.ready=!!d.value;net.players.set(d.id,p);refreshLobby();
    }else if(d.t==="lobby"){
      if(Number.isFinite(d.players))gameState.partySize=Math.max(1,Math.min(8,d.players));
      if(Array.isArray(d.ready)){
        for(const [id,p] of net.players){
          p.ready=d.ready.includes(id);
          net.players.set(id,p);
        }
        for(const id of d.ready){
          if(net.players.has(id))continue;
          net.players.set(id,{ready:true,lastRecv:performance.now()});
        }
      }
      if(d.gift&&OWNER_COSMETIC_IDS.includes(d.gift.id)){
        ownerGiftState.active=true;
        ownerGiftState.id=d.gift.id;
        ownerGiftState.dropId=Number(d.gift.dropId)||0;
        ownerGiftState.ownerId=d.gift.ownerId||null;
        ownerGiftState.claimed=new Set();
        buildOwnerGiftVisual(ownerGiftState.id);
      }else if(!d.gift&&ownerGiftState.active){
        ownerGiftState.active=false;
        disposeOwnerGiftVisual();
      }
      if(d.map&&MAP_CATALOG.some(m=>m.id===d.map))gameState.selectedMap=d.map;
      if(["NORMAL","SURVIVAL","ENDLESS","HARDCORE"].includes(d.mode))gameState.mode=d.mode;
      if(["CHILL","NORMAL","CRAZY"].includes(d.difficulty))gameState.settings.npcDifficulty=d.difficulty;
      saveGame();refreshLobby();
    }else if(d.t==="start"){
      net.ready=false;
      net.matchMembers=new Set(Array.isArray(d.matchIds)?d.matchIds:[]);
      gameState.partySize=Math.max(1,Math.min(4,Number(d.matchPlayers)||2));
      if(d.map&&MAP_CATALOG.some(m=>m.id===d.map))gameState.selectedMap=d.map;
      if(["NORMAL","SURVIVAL","ENDLESS","HARDCORE"].includes(d.mode))gameState.mode=d.mode;
      if(["CHILL","NORMAL","CRAZY"].includes(d.difficulty))gameState.settings.npcDifficulty=d.difficulty;
      if(d.progress&&gameState.mapProgress[d.map])gameState.mapProgress[d.map]={...gameState.mapProgress[d.map],...d.progress};
      const forcedModifier=(typeof d.modifier==="string"&&WAVE_MODIFIERS.includes(d.modifier))?d.modifier:null;
      saveGame();startMap(forcedModifier);
      extraNpcs.forEach(e=>e.root.setEnabled(false));
      if(xrCamera){
        const s=getMapSpawn();
        const slot=Math.max(1,Math.min(3,Number(d.slot)||1));
        const offsets=[0,1.1,-1.1,2.0];
        xrCamera.position.x=s.x+offsets[slot];
        xrCamera.position.z=s.z+.35+(slot===3?.5:0);
      }
    }else if(d.t==="matchWaiting"){
      net.matchMembers.clear();
      net.status=`MATCH IN PROGRESS • ${Math.max(1,Math.min(4,Number(d.players)||1))} PLAYERS • YOU STAY READY IN PUBLIC LOBBY`;
      refreshLobby();
    }else if(d.t==="hostPose"){
      setRemotePose("host",d);
    }else if(d.t==="remotePose"&&d.id){
      if(d.id!==net.playerId)setRemotePose(d.id,d);
    }else if(d.t==="playerLeft"&&d.id){
      hidePlayerAvatar(d.id);
      net.players.delete(d.id);
    }else if(d.t==="npc"){
      applyHostNpcState(d);
    }else if(d.t==="resetReady"){
      net.ready=false;
      for(const [id,p] of net.players){p.ready=false;net.players.set(id,p);}
      refreshLobby();
    }else if(d.t==="returnLobby"){
      net.ready=false;net.matchMembers.clear();
      for(const [,p] of net.players)p.reportedInMatch=false;
      goLobby(true);
    }else if(d.t==="leave"){
      net.status="HOST LEFT";net.connected=false;net.ready=false;gameState.partySize=1;
      try{net.hostConn?.close();}catch(_){}
      net.hostConn=null;
      try{net.peer?.destroy();}catch(_){}
      net.peer=null;
      clearRemotePlayers();saveGame();
      if(gameMode==="map")goLobby(true);else refreshLobby();
      setTimeout(()=>ensurePublicLobby(),220);
      return;
    }else if(d.t==="ownerGiftDrop"&&OWNER_COSMETIC_IDS.includes(d.id)){
      ownerGiftState.active=true;
      ownerGiftState.id=d.id;
      ownerGiftState.dropId=Number(d.dropId)||0;
      ownerGiftState.ownerId=d.ownerId||null;
      ownerGiftState.claimed=new Set();
      buildOwnerGiftVisual(d.id);refreshLobby();
    }else if(d.t==="ownerGiftClear"){
      ownerGiftState.active=false;ownerGiftState.id=null;
      disposeOwnerGiftVisual();refreshLobby();
    }else if(d.t==="ownerGiftGranted"&&OWNER_COSMETIC_IDS.includes(d.id)){
      grantOwnerGift(d.id);
    }else if(d.t==="mapEvent"){
      if(gameMode==="map"&&d.map===gameState.selectedMap)applyLocalMapEvent(d.map,typeof d.label==="string"?d.label:null);
    }else if(d.t==="blockConfirmed"){
      if(npc){npc.attackBlocked=true;npc.attackHasHit=true;npc.attackAnim=0;}
      pulse(batHand(),1,110);pulse(supportHand(),.30,45);
      cameraImpactShake=Math.max(cameraImpactShake,.35);
      playImpactSound("block",.9);
      recordBlock();
    }else if(d.t==="slap"&&typeof d.target==="string"){
      applySlapToTarget(d.target,d.zone==="hand"?"hand":"butt",d.side==="left"?"left":"right",Math.max(.45,Math.min(1.2,Number(d.strength)||.9)),d.targetSide==="left"?"left":d.targetSide==="right"?"right":null);
    }else if(d.t==="npcSlap"){
      if(gameMode==="map")slapNpc(d.zone==="body"?"body":"butt",d.side==="left"?"left":"right",Math.max(.45,Math.min(1.2,Number(d.strength)||.9)));
    }else if(d.t==="npcDamage"){
      if(gameMode!=="map"||playerDead)return;
      const from=arrv(d.from)||new BABYLON.Vector3();
      const amount=Math.max(1,Math.min(100,Number(d.amount)||1));
      hurtPlayer(amount,from);
    }else if(d.t==="revive"){
      if(playerDowned)reviveLocalPlayer();
    }
  }

  function allGuestsReady(){
    if(!net.isHost||net.connections.size===0)return false;
    for(const [pid,c] of net.connections){
      if(!c?.open||!net.players.get(pid)?.ready)return false;
    }
    return true;
  }

  function hostStartMultiplayer(){
    if(!net.isHost)return;
    const readyGuests=[...net.connections.entries()]
      .filter(([pid,c])=>c?.open&&net.players.get(pid)?.ready)
      .slice(0,3);

    const selectedIds=readyGuests.map(([pid])=>pid);

    // Gift drops only exist while the owner is physically in this public lobby.
    if(ownerGiftState.active){
      const ownerLeavesLobby=ownerGiftState.ownerId==="host"||selectedIds.includes(ownerGiftState.ownerId);
      if(ownerLeavesLobby)clearOwnerGiftDrop();
    }

    net.matchMembers=new Set(selectedIds);
    for(const [pid,p] of net.players){
      p.inMatch=net.matchMembers.has(pid);
      if(p.inMatch)p.ready=false;
      net.players.set(pid,p);
    }

    const progress={...currentMapProgress()};
    const matchCount=1+selectedIds.length;
    gameState.partySize=matchCount;
    for(const pid of selectedIds)broadcast({t:"readyState",id:pid,value:false});

    // Start the host run first so waveModifier is the exact modifier sent to guests.
    startMap();
    const syncedModifier=waveModifier;

    for(const [pid,c] of net.connections){
      if(!c?.open)continue;
      if(net.matchMembers.has(pid)){
        const slot=1+selectedIds.indexOf(pid);
        sendConn(c,{
          t:"start",map:gameState.selectedMap,mode:gameState.mode,
          difficulty:gameState.settings.npcDifficulty,progress,slot,modifier:syncedModifier,
          matchPlayers:matchCount,matchIds:["host",...selectedIds]
        });
      }else{
        sendConn(c,{t:"matchWaiting",players:matchCount});
      }
    }

    if(xrCamera){
      const s=getMapSpawn();
      xrCamera.position.x=s.x-2.0;
      xrCamera.position.z=s.z+.35;
    }
  }

  function toggleNetReady(){
    if(!net.connected||net.isHost)return;
    net.ready=!net.ready;sendHost({t:"ready",value:net.ready});refreshLobby();
  }

  function lobbyMultiplayer(){
    let t=`PUBLIC LOBBY • UP TO 8 PLAYERS
MAP MATCHES • UP TO 4 PLAYERS

`;
    if((!net.peer&&!net.connected)||networkIsIdle()){
      t+=`▶ RECONNECT TO PUBLIC LOBBY

${net.status}

You are automatically placed in a public lobby.
Trigger = reconnect • Grip = back`;
      return t;
    }
    if(net.isHost){
      const ready=[...net.connections.entries()].filter(([pid,c])=>c?.open&&net.players.get(pid)?.ready).length;
      t+=`PUBLIC LOBBY
PLAYERS: ${netPlayerCount()}/8
READY / QUEUED: ${ready}
MAP: ${gameState.selectedMap.toUpperCase()} • ${gameState.mode}
DIFFICULTY: ${gameState.settings.npcDifficulty}

`;
      t+=`${lobbyIndex===0?"▶ ":"   "}START MATCH WITH UP TO 3 READY PLAYERS
`;
      t+=`${lobbyIndex===1?"▶ ":"   "}REJOIN ANOTHER PUBLIC LOBBY
`;
    }else{
      t+=`PUBLIC LOBBY
PLAYERS: ${gameState.partySize}/8

`;
      t+=`${lobbyIndex===0?"▶ ":"   "}${net.ready?"READY / QUEUED FOR NEXT MATCH: YES ✓":"READY / QUEUED FOR NEXT MATCH: NO"}
`;
      t+=`${lobbyIndex===1?"▶ ":"   "}REJOIN ANOTHER PUBLIC LOBBY
`;
    }
    t+=`
${net.status}
Grip = back`;
    return t;
  }

  function activateMultiplayerLobby(){
    if((!net.peer&&!net.connected)||networkIsIdle()){
      joinPublicMatch();return;
    }
    if(net.isHost){
      if(lobbyIndex===0)hostStartMultiplayer();
      else {destroyNetwork(true);setTimeout(()=>joinPublicMatch(),120);}
    }else{
      if(lobbyIndex===0)toggleNetReady();
      else {sendHost({t:"leave"});destroyNetwork(true);setTimeout(()=>joinPublicMatch(),120);}
    }
  }

  function ensurePublicLobby(){
    if(gameMode!=="lobby")return;
    if(net.connected||net.isHost||net.publicSearching||net.peer)return;
    setTimeout(()=>{
      if(gameMode==="lobby"&&!net.connected&&!net.isHost&&!net.publicSearching&&!net.peer)joinPublicMatch();
    },180);
  }

  function networkIsIdle(){
    return !net.connected && (!net.peer || !net.hostConn) &&
      ["OFFLINE","ROOM FULL (8/8)","ALREADY CONNECTED","ROOM NOT FOUND / NETWORK ERROR","NETWORK ERROR","CONNECTION ERROR","HOST DISCONNECTED","HOST LEFT","CONNECTION LOST"].includes(net.status);
  }

  function networkLobbyItemCount(){
    if((!net.peer&&!net.connected)||networkIsIdle())return 1;
    return 2;
  }

  function netPosePacket(){
    if(!xrCamera)return null;
    const head=xrCamera.globalPosition||xrCamera.position;
    const headRot=xrCamera.absoluteRotationQuaternion||xrCamera.rotationQuaternion||BABYLON.Quaternion.Identity();
    const left=hands.left?.node?calibratedHandWorld(hands.left):null;
    const right=hands.right?.node?calibratedHandWorld(hands.right):null;
    const batVisible=!!batRoot?.isEnabled?.()&&!batHolstered;
    const bp=batVisible?(batRoot?.getAbsolutePosition?.()||batRoot?.position):null;
    const bq=batVisible?(batRoot?.absoluteRotationQuaternion||batRoot?.rotationQuaternion):null;
    return {
      t:"pose",id:net.playerId,head:v3arr(head),headRot:qarr(headRot),left:v3arr(left),right:v3arr(right),
      batPos:v3arr(bp),batRot:qarr(bq),batVisible,batHolstered:!!batHolstered,
      hp:playerHP,downed:playerDowned,dead:playerDead,color:gameState.potatoRGB,
      talking:!!localVoiceActive,
      inMatch:gameMode==="map",
      ownerCosmetics:Object.values(gameState.equippedCosmetics||{}).filter(id=>OWNER_COSMETIC_IDS.includes(id))
    };
  }

  function remotePlayerCombatData(id){
    const p=net.players.get(id);
    if(!p?.pose?.head||p.dead||p.downed)return null;
    if(!p.lastPoseRecv||performance.now()-p.lastPoseRecv>1200)return null;
    const head=arrv(p.pose.head);if(!head)return null;
    return {
      id,
      local:false,
      head,
      chest:head.add(new BABYLON.Vector3(0,-.34,0)),
      pos:head
    };
  }

  function npcCombatTarget(){
    const localHead=playerWorldPos();
    let best=(!playerDead&&!playerDowned)?{
      id:"host",local:true,head:localHead.clone(),
      chest:localHead.add(new BABYLON.Vector3(0,-.34,0)),
      pos:localHead.clone()
    }:null;
    let bestD=best?BABYLON.Vector3.Distance(best.pos,npc?.root?.position||best.pos):Infinity;

    if(net.isHost){
      for(const [id] of net.players){
        const c=net.connections.get(id);
        if(!c?.open)continue;
        if(gameMode==="map"&&!net.matchMembers.has(id))continue;
        const t=remotePlayerCombatData(id);if(!t)continue;
        const d=BABYLON.Vector3.Distance(t.pos,npc?.root?.position||t.pos);
        if(d<bestD){best=t;bestD=d;}
      }
    }
    return best;
  }

  function combatTargetSpheres(t){
    if(!t)return [];
    return [
      {name:"head",center:t.head.clone(),radius:.135},
      {name:"chest",center:t.chest.clone(),radius:.20}
    ];
  }

  function remoteBatSegment(id){
    const p=net.players.get(id);
    if(!p?.pose||!p.lastPoseRecv||performance.now()-p.lastPoseRecv>900)return null;
    if(p.pose.batVisible===false||p.pose.batHolstered)return null;
    const bp=arrv(p.pose.batPos),bq=arrq(p.pose.batRot);
    if(!bp||!bq)return null;
    const rotM=BABYLON.Matrix.FromQuaternion(bq);
    const localBase=new BABYLON.Vector3(0,-.14,0);
    const localTip=new BABYLON.Vector3(0,.72,0);
    const base=BABYLON.Vector3.TransformCoordinates(localBase,rotM).add(bp);
    const tip=BABYLON.Vector3.TransformCoordinates(localTip,rotM).add(bp);
    return {base,tip};
  }

  function validateRemoteBlock(id,weaponBase,weaponTip){
    const seg=remoteBatSegment(id);
    if(!seg)return false;
    return segmentSegmentDistance(weaponBase,weaponTip,seg.base,seg.tip)<.28;
  }

  function damageCombatTarget(t,amount,fromWorldPos){
    if(!t||amount<=0)return;
    if(t.local){
      hurtPlayer(amount,fromWorldPos);
      return;
    }
    const c=net.connections.get(t.id);
    if(c?.open)sendConn(c,{t:"npcDamage",amount:Math.max(1,Math.round(amount)),from:v3arr(fromWorldPos)});
  }

  function npcFaceTarget(){
    if(!(net.connected&&!net.isHost))return npcCombatTarget();

    const id=npc?.netTargetId;
    if(id===net.playerId){
      const head=playerWorldPos();
      return {id,local:true,pos:head,head,chest:head.add(new BABYLON.Vector3(0,-.34,0))};
    }
    if(id==="host"){
      const p=net.players.get("host");
      if(p?.lastRecv&&performance.now()-p.lastRecv>1500)return null;
      const head=arrv(p?.pose?.head);
      if(head)return {id:"host",local:false,pos:head,head,chest:head.add(new BABYLON.Vector3(0,-.34,0))};
      return null;
    }
    if(id){
      const p=net.players.get(id);
      if(p?.lastRecv&&performance.now()-p.lastRecv>1500)return null;
      const head=arrv(p?.pose?.head);
      if(head)return {id,local:false,pos:head,head,chest:head.add(new BABYLON.Vector3(0,-.34,0))};
    }
    return null;
  }

  function netNpcPacket(){
    if(!npc)return null;
    const target=npcCombatTarget();
    return {
      t:"npc",pos:v3arr(npc.root.position),rot:[npc.root.rotation.x,npc.root.rotation.y,npc.root.rotation.z],
      hp:npc.hpValue,maxHp:npc.maxHp,armor:npc.bossArmor||0,dead:!!npc.dead,
      deathPhase:npc.deathPhase||"none",deathTimer:npc.deathTotalTimer||0,
      type:npc.typeName,variant:npc.variant,weaponBroken:!!npc.weaponBroken,
      emotion:npc.emotion||"normal",screamKind:npc.screamKind||null,targetId:npc.dead?null:(target?.id||null),
      faceStyle:npc.faceStyle||0,outfitStyle:npc.outfitStyle||0,
      level:currentMapProgress().level
    };
  }

  function applyHostNpcState(d){
    if(!npc||gameMode!=="map")return;
    const p=arrv(d.pos);if(p)npc.root.position.copyFrom(p);
    if(Array.isArray(d.rot)&&d.rot.length>=3)npc.root.rotation.set(d.rot[0],d.rot[1],d.rot[2]);
    if(Number.isFinite(d.hp))npc.hpValue=d.hp;
    if(Number.isFinite(d.maxHp))npc.maxHp=d.maxHp;
    if(Number.isFinite(d.armor))npc.bossArmor=d.armor;
    const wasDead=!!npc.dead;
    npc.dead=!!d.dead;npc.weaponBroken=!!d.weaponBroken;
    if(typeof d.deathPhase==="string")npc.deathPhase=d.deathPhase;
    if(Number.isFinite(d.deathTimer))npc.deathTotalTimer=d.deathTimer;
    if(npc.dead&&!wasDead){
      npc.deathPhase=(d.deathPhase&&d.deathPhase!=="none")?d.deathPhase:"collapse";
      npc.deathTotalTimer=Number.isFinite(d.deathTimer)?d.deathTimer:0;
      npc.velocity.y=Math.min(npc.velocity.y||0,.35);
    }else if(!npc.dead&&wasDead){
      npc.deathPhase="none";
      npc.deathPhaseTimer=0;
      npc.deathTotalTimer=0;
      npc.velocity.set(0,0,0);
      npc.angular?.set?.(0,0,0);
    }
    if(npc.dead)npc.netTargetId=null;
    if(d.type)npc.typeName=d.type;if(d.variant)npc.variant=d.variant;
    if(typeof d.emotion==="string"){
      npc.emotion=d.emotion;
      npc.emotionBurst=Math.max(npc.emotionBurst||0,.22);
    }
    if(typeof d.screamKind==="string")npc.screamKind=d.screamKind;
    if(Number.isInteger(d.faceStyle))npc.faceStyle=BABYLON.Scalar.Clamp(d.faceStyle,0,3);
    if(Number.isInteger(d.outfitStyle))npc.outfitStyle=BABYLON.Scalar.Clamp(d.outfitStyle,0,3);
    npc.netTargetId=npc.dead?null:(typeof d.targetId==="string"?d.targetId:null);
    updateNpcLabel();
    npc.root.setEnabled(true);
    if(!d.dead){
      npc.body?.setEnabled?.(true);
      npc.head?.setEnabled?.(true);
      npc.hair?.setEnabled?.(true);
      npc.hp?.plane?.setEnabled?.(true);
      npc.weaponRoot?.setEnabled?.(!npc.weaponBroken);
    }else{
      npc.hp?.plane?.setEnabled?.(false);
      npc.weaponRoot?.setEnabled?.(false);
    }
  }

  function updateRemoteAvatars(dt){
    const a=1-Math.exp(-dt*18);
    const t=performance.now()*.001;
    for(const av of remoteAvatars){
      if(!av.root.isEnabled())continue;
      if(av.targetHead){
        av.head.position=BABYLON.Vector3.Lerp(av.head.position,av.targetHead,a);
        if(av.targetHeadRot){
          if(!av.head.rotationQuaternion)av.head.rotationQuaternion=BABYLON.Quaternion.Identity();
          av.head.rotationQuaternion=BABYLON.Quaternion.Slerp(av.head.rotationQuaternion,av.targetHeadRot,a);
        }
        const chestTarget=av.targetHead.add(new BABYLON.Vector3(0,-.42,0));
        if(av.targetDowned)chestTarget.y=Math.min(chestTarget.y,.35);
        av.chest.position=BABYLON.Vector3.Lerp(av.chest.position,chestTarget,a);
      }
      if(av.targetLeft)av.left.position=BABYLON.Vector3.Lerp(av.left.position,av.targetLeft,a);
      if(av.targetRight)av.right.position=BABYLON.Vector3.Lerp(av.right.position,av.targetRight,a);
      if(av.targetBatPos)av.bat.position=BABYLON.Vector3.Lerp(av.bat.position,av.targetBatPos,a);
      if(av.targetBatRot){
        if(!av.bat.rotationQuaternion)av.bat.rotationQuaternion=BABYLON.Quaternion.Identity();
        av.bat.rotationQuaternion=BABYLON.Quaternion.Slerp(av.bat.rotationQuaternion,av.targetBatRot,a);
      }

      const chestPos=av.chest.position.clone();
      const sway=Math.sin(t*4.2+av.slot*.8)*.008;
      av.buttJiggleTimer=Math.max(0,(av.buttJiggleTimer||0)-dt);
      av.buttJiggle=(av.buttJiggle||0)*Math.pow(.14,dt);
      const jig=av.buttJiggle||0;
      const jigLife=Math.min(1,(av.buttJiggleTimer||0)/.8);
      const shake=Math.sin(t*31+av.slot)*jig*jigLife*.075;
      const rear=avatarRearVector(av),rightVec=avatarRightVector(av);
      const buttBase=chestPos.add(rear.scale(.30+jig*.07));
      av.buttL.position=BABYLON.Vector3.Lerp(av.buttL.position,buttBase.add(rightVec.scale(-.14-shake)).add(new BABYLON.Vector3(0,.02+sway+shake*.45,0)),a);
      av.buttR.position=BABYLON.Vector3.Lerp(av.buttR.position,buttBase.add(rightVec.scale(.14+shake)).add(new BABYLON.Vector3(0,.02-sway-shake*.45,0)),a);
      av.buttL.scaling.set(1.0,1.0+.13*jig+Math.abs(shake),1.18+.18*jig);
      av.buttR.scaling.set(1.0,1.0+.13*jig+Math.abs(shake),1.18+.18*jig);

      // Talking face: takes about 5 seconds to fully change, and 5 seconds to return.
      const talkTarget=av.talking?1:0;
      const talkStep=dt/5;
      av.talkLevel=av.talkLevel<talkTarget?Math.min(talkTarget,av.talkLevel+talkStep):Math.max(talkTarget,av.talkLevel-talkStep);
      const talk=av.talkLevel||0;
      const mouthPulse=av.talking?(0.5+0.5*Math.sin(t*13+av.slot)):0;
      if(av.face){
        for(const e of av.face.eyes||[]){
          e.scaling.x=1+talk*.28;
          e.scaling.y=1+talk*.34;
        }
        for(const p of av.face.pupils||[]){
          p.scaling.x=1+talk*.10;
          p.scaling.y=1+talk*.10;
        }
        for(const b of av.face.brows||[]){
          b.position.y=.145+talk*.065;
        }
      }

      if(av.handSlapTimer>0){
        av.handSlapTimer=Math.max(0,av.handSlapTimer-dt);
        av.handSlapKick=Math.max(0,(av.handSlapKick||0)-dt*.30);
        const target=av.handSlapSide==="left"?av.left:av.right;
        if(target){
          const phase=1-av.handSlapTimer/.55;
          target.position.y+=Math.sin(phase*Math.PI)*(.05+(av.handSlapKick||0));
          target.position.x+=(av.handSlapSide==="left"?-1:1)*Math.sin(phase*Math.PI)*.035;
        }
      }

      av.faceReactTimer=Math.max(0,(av.faceReactTimer||0)-dt);
      if(av.face?.mouth){
        if(av.faceReactTimer>0){
          av.face.mouth.scaling.y=Math.max(1.7,.55+(av.talkLevel||0)*(1.0+mouthPulse*.65));
          av.face.mouth.scaling.x=.92;
        }else{
          av.face.mouth.scaling.y=.55+(av.talkLevel||0)*(.85+mouthPulse*.70);
          av.face.mouth.scaling.x=1-(av.talkLevel||0)*.08;
        }
      }

      av.slapPrintTimer=Math.max(0,(av.slapPrintTimer||0)-dt);
      av.slapFloatTimer=Math.max(0,(av.slapFloatTimer||0)-dt);

      if(av.printPlane){
        if(av.slapPrintTimer>0){
          av.printPlane.setEnabled(true);
          const rear=avatarRearVector(av),right=avatarRightVector(av);
          av.printPlane.position.copyFrom(avatarButtCenter(av).add(rear.scale(.17)).add(right.scale(.10*(av.slapPrintSide||1))));
          av.printPlane.lookAt(av.printPlane.position.add(rear));
        }else{
          av.printPlane.setEnabled(false);
        }
      }

      if(av.floatHand){
        if(av.slapFloatTimer>0){
          av.floatHand.setEnabled(true);
          const k=1-av.slapFloatTimer/1;
          const rear=avatarRearVector(av),right=avatarRightVector(av);
          av.floatHand.position.copyFrom(avatarButtCenter(av).add(rear.scale(.08)).add(right.scale(.12*(av.slapPrintSide||1))).add(new BABYLON.Vector3(0,.18+k*.34,0)));
          av.floatHand.scaling.setAll(1+.12*k);
        }else{
          av.floatHand.setEnabled(false);
        }
      }
    }
  }

  function updateNetworking(){
    const now=performance.now();
    const ndt=Math.min(.1,engine.getDeltaTime()/1000);
    net.reviveCooldown=Math.max(0,net.reviveCooldown-ndt);
    net.hitCooldown=Math.max(0,net.hitCooldown-ndt);
    net.blockCooldown=Math.max(0,(net.blockCooldown||0)-ndt);

    if(net.isHost){
      if(!net.peer)return;
      for(const [pid,p] of [...net.players]){
        if(p?.lastPoseRecv&&now-p.lastPoseRecv>4000)hidePlayerAvatar(pid);
        if(p?.lastRecv&&now-p.lastRecv>10000){
          const c=net.connections.get(pid);
          hidePlayerAvatar(pid);
          net.connections.delete(pid);
          net.matchMembers.delete(pid);
          net.players.delete(pid);
          try{c?.close();}catch(_){}
          broadcast({t:"playerLeft",id:pid});
          broadcast({t:"playerCount",count:netPlayerCount()});
        }
      }
      net.connected=[...net.connections.values()].some(c=>c?.open);
      const previousPartySize=gameState.partySize;
      if(gameMode==="lobby")gameState.partySize=Math.max(1,Math.min(8,netPlayerCount()));
      else gameState.partySize=Math.max(1,Math.min(4,1+[...net.matchMembers].filter(id=>net.connections.get(id)?.open).length));
      if(previousPartySize!==gameState.partySize)saveGame();
      net.status=gameMode==="lobby"?(net.connected?`PUBLIC LOBBY • ${netPlayerCount()}/8`:"PUBLIC LOBBY • WAITING • 1/8"):`MATCH • ${gameState.partySize}/4`;
      if(gameMode==="lobby"&&now-net.lastLobbySync>1000){
        net.lastLobbySync=now;
        broadcast(currentLobbyState());
      }
      if(now-net.lastSend<50)return;
      net.lastSend=now;

      const pose=netPosePacket();
      if(pose){
        for(const [pid,c] of net.connections){
          if(gameMode==="map"&&!net.matchMembers.has(pid))continue;
          sendConn(c,{...pose,t:"hostPose",id:"host"});
        }
      }
      if(gameMode==="map"){
        const np=netNpcPacket();
        if(np){
          for(const id of net.matchMembers)sendConn(net.connections.get(id),np);
        }
      }
    }else{
      if(!net.connected||!net.hostConn?.open)return;
      if(now-net.lastSend<50)return;
      net.lastSend=now;

      const pose=netPosePacket();
      if(pose)sendHost(pose);

      if(net.lastRecv&&now-net.lastRecv>7000){
        net.status="CONNECTION LOST";
        net.connected=false;net.ready=false;gameState.partySize=1;
        try{net.hostConn?.close();}catch(_){}
        net.hostConn=null;
        try{net.peer?.destroy();}catch(_){}
        net.peer=null;
        clearRemotePlayers();saveGame();
        if(gameMode==="map")goLobby(true);else refreshLobby();
        return;
      }
      for(const [pid,p] of [...net.players]){
        if(p?.lastRecv&&now-p.lastRecv>10000){
          hidePlayerAvatar(pid);
          net.players.delete(pid);
        }
      }
    }

    // Revive any nearby downed teammate by holding left grip.
    if(net.reviveCooldown<=0&&btn(hands.left,1)&&hands.left?.node){
      const lp=hands.left.node.getAbsolutePosition?.()||hands.left.node.position;
      for(const [pid,p] of net.players){
        if(gameMode==="map"&&net.isHost&&!net.matchMembers.has(pid))continue;
        if(gameMode==="map"&&!net.isHost&&net.matchMembers.size&&!net.matchMembers.has(pid))continue;
        if(!p?.downed||!p.pose?.head)continue;
        if(net.isHost&&!net.connections.get(pid)?.open)continue;
        if(p.lastRecv&&performance.now()-p.lastRecv>1500)continue;
        const rh=arrv(p.pose.head);
        if(rh&&BABYLON.Vector3.Distance(lp,rh)<1.1){
          if(net.isHost){
            if(pid==="host")continue;
            const c=net.connections.get(pid);
            if(c){
              sendConn(c,{t:"revive"});
              const rp=net.players.get(pid);if(rp)rp.downed=false;
            }
          }else{
            sendHost({t:"revive",target:pid});
          }
          net.reviveCooldown=.85;
          break;
        }
      }
    }
  }

  function netGuestHit(hitPos,swingVel,speed){
    if(!(net.connected&&!net.isHost))return false;
    if(net.hitCooldown>0)return true;
    net.hitCooldown=.16;
    sendHost({t:"hit",pos:v3arr(hitPos),vel:v3arr(swingVel),speed:Math.min(12,speed)});
    pulse(batHand(),Math.min(.7,.10+speed*.08),35+Math.min(70,speed*5));
    return true;
  }

  function refreshLobby(){if(lobbySub!=="main")lobbyText.fontSize=28;if(lobbySub!=="avatar")showAvatarPreview(false);if(lobbySub!=="inspect")showBatPreview(false);if(lobbySub!=="practice")showPracticeDummy(false);if(gameState.pendingDuplicate)lobbyText.text=lobbyDup();else if(lobbySub==="maps")lobbyText.text=lobbyMaps();else if(lobbySub==="bats")lobbyText.text=lobbyBats();else if(lobbySub==="skins")lobbyText.text=lobbySkins();else if(lobbySub==="cosmetics")lobbyText.text=lobbyCosmetics();else if(lobbySub==="colors")lobbyText.text=lobbyPotatoColors();else if(lobbySub==="bundles")lobbyText.text=lobbyBundles();else if(lobbySub==="gemshop")lobbyText.text=lobbyGemShop();else if(lobbySub==="settings")lobbyText.text=lobbySettings();else if(lobbySub==="controls")lobbyText.text=lobbyControls();else if(lobbySub==="prematch")lobbyText.text=lobbyPrematch();else if(lobbySub==="avatar")lobbyText.text=lobbyAvatarPreview();else if(lobbySub==="inspect")lobbyText.text=lobbyBatInspect();else if(lobbySub==="practice")lobbyText.text=lobbyPractice();else if(lobbySub==="difficulty")lobbyText.text=lobbyDifficulty();else if(lobbySub==="calibration")lobbyText.text=lobbyHandCalibration();else if(lobbySub==="holster")lobbyText.text=lobbyHolster();else if(lobbySub==="testmode")lobbyText.text=lobbyTestMode();else if(lobbySub==="owner")lobbyText.text=lobbyOwnerVault();else if(lobbySub==="trading")lobbyText.text=lobbyOnline("TRADING");else if(lobbySub==="multi")lobbyText.text=lobbyMultiplayer();else lobbyText.text=lobbyMain();}
  function clearRuntimeMap(){runtimeColliders.forEach(removeCollision);runtimeColliders=[];if(runtimeMapRoot){runtimeMapRoot.dispose(false,true);runtimeMapRoot=null;}}
  function mapTheme(id){return {school:["#9aa5b1","#e6dfc7","#4d6985"],house:["#8d7761","#e9dfd0","#6b8a63"],supermarket:["#7a8794","#e6e8eb","#dc4d41"],gym:["#343c48","#c9ced5","#e87235"],hotel:["#7a695d","#e5ded6","#a77a48"],bank:["#5a6773","#dde2e6","#92773f"],metro:["#39434f","#9ba4ad","#d6a627"],factory:["#333b43","#727b82","#d56d28"],cinema:["#231f2e","#5f596c","#b83a4c"],arcade:["#242038","#493d67","#ff4fb7"],city:["#414b55","#8f9ba5","#3d8dc4"],forest:["#53664b","#31452e","#77945d"],beach:["#d2b87c","#8ed0dd","#f4d35e"],construction:["#655c50","#8f8a82","#f0a52b"],mall:["#89949f","#e4e7e9","#6fa7c7"],police:["#3d4d63","#d9dde3","#315fa8"],hospital:["#a9b8bd","#e9eeee","#49a6a6"],lab:["#7f8992","#d9e1e6","#67c6d5"],stadium:["#4f6751","#9aa0a6","#5d9f61"],castle:["#66635c","#8b877e","#8b2635"],farm:["#7a684d","#71845a","#d4aa58"],pirate:["#5d4936","#7a6b5b","#a73c2e"],amusement:["#6c76a2","#d4d6e1","#e85d75"],volcano:["#352a2a","#5b3c36","#e65325"],space:["#242c38","#586477","#62a5d8"],alien:["#2d2940","#4b3c66","#7ad36f"]}[id]||["#555f68","#c8cdd2","#4c91c4"];}
  function buildRuntimeMap(id){clearRuntimeMap();if(id==="office")return;runtimeMapRoot=new BABYLON.TransformNode("runtime_"+id,scene);runtimeMapRoot.position.copyFrom(RUNTIME_CENTER);const [fh,wh,ah]=mapTheme(id),fm=mkMat("floor_"+id,fh),wm=mkMat("wall_"+id,wh),am=mkMat("accent_"+id,ah);const add=(n,world,s,mat,c=true)=>{const m=BABYLON.MeshBuilder.CreateBox(n,{width:s.x,height:s.y,depth:s.z},scene);m.parent=runtimeMapRoot;m.position.copyFrom(world.subtract(RUNTIME_CENTER));m.material=mat;if(c){addCollision(m);runtimeColliders.push(m);}return m;};add("arenaFloor",new BABYLON.Vector3(66,-.12,-6),new BABYLON.Vector3(18,.24,18),fm);add("arenaBack",new BABYLON.Vector3(66,2.5,-15),new BABYLON.Vector3(18,5,.2),wm);add("arenaLeft",new BABYLON.Vector3(57,2.5,-6),new BABYLON.Vector3(.2,5,18),wm);add("arenaRight",new BABYLON.Vector3(75,2.5,-6),new BABYLON.Vector3(.2,5,18),wm);add("arenaFrontL",new BABYLON.Vector3(60,2.5,3),new BABYLON.Vector3(6,5,.2),wm);add("arenaFrontR",new BABYLON.Vector3(72,2.5,3),new BABYLON.Vector3(6,5,.2),wm);for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=3.8+(i%3)*.9;add("mapProp"+i,new BABYLON.Vector3(66+Math.cos(a)*r,.55,-6+Math.sin(a)*r),new BABYLON.Vector3(.7+(i%2)*.35,1.1,.7),i%2?am:wm);}add("bossPlatform",new BABYLON.Vector3(66,.08,-12.5),new BABYLON.Vector3(4.5,.16,2.5),am);}
  const getMapSpawn=()=>gameState.selectedMap==="office"?new BABYLON.Vector3(0,0,-1.5):new BABYLON.Vector3(66,0,-3);
  function getNpcSpawnPosition(){const c=gameState.selectedMap==="office"?new BABYLON.Vector3(0,0,-6):RUNTIME_CENTER;return new BABYLON.Vector3(c.x+(Math.random()-.5)*3.2,0,c.z-3.7+Math.random()*1.2);}
  function goLobby(fromNetwork=false){for(const [,p] of net.players){p.inMatch=false;p.reportedInMatch=false;}const wasHolstered=batHolstered;batHolstered=false;if(wasHolstered&&!attachBatToSelectedHand()){batRoot.parent=null;batRoot.setEnabled(false);}
    mapEventText="";mapEventTextTimer=0;
    playerDead=false;playerDowned=false;downedTimer=0;deathTimer=0;playerHP=PLAYER_MAX_HP;playerInvuln=.5;
    deathPlane?.setEnabled?.(false);hudPlane?.setEnabled?.(true);
    if(!fromNetwork){
      if(net.isHost&&net.connected){broadcastMatch({t:"returnLobby"});}
      else if(net.connected&&!net.isHost){
        sendHost({t:"leave"});
        destroyNetwork(true);
      }
    }
    net.matchMembers.clear();
    if(npc)npc.netTargetId=null;quickMenuDebounce=0;groundSlamCooldown=0;combatInputPrev.trigger=false;combatInputPrev.grip=false;chargeTime=0;batTipLast=null;batBaseLast=null;playerDowned=false;downedTimer=0;if(batThrown&&!attachBatToRightHand()){batRoot.parent=null;batRoot.setEnabled(false);}closeQuickMenu();gameMode="lobby";setMusicMode("normal");clearRuntimeMap();lobbySub="main";lobbyIndex=0;lastLobbyMessage="";mirror.setEnabled(true);mirrorFrame.setEnabled(true);lobbyScreen.setEnabled(true);if(xrCamera){xrCamera.position.set(30,.08,-5);bodyVelocity.set(0,0,0);keepRigAboveFloor();}if(npc?.root)npc.root.setEnabled(false);extraNpcs.forEach(e=>e.root.setEnabled(false));syncOwnerGiftVisual();refreshLobby();ensurePublicLobby();}
  function startMap(forcedModifier=null){hidePack2();const wasHolstered=batHolstered;batHolstered=false;if(wasHolstered&&!attachBatToSelectedHand()){batRoot.parent=null;batRoot.setEnabled(false);}mapEventText="";mapEventTextTimer=0;quickMenuDebounce=0;groundSlamCooldown=0;combatInputPrev.trigger=false;combatInputPrev.grip=false;chargeTime=0;batTipLast=null;batBaseLast=null;if(batThrown&&!attachBatToRightHand()){batRoot.parent=null;batRoot.setEnabled(false);}gameMode="map";syncOwnerGiftVisual();playerDowned=false;downedTimer=0;resetRunStats(forcedModifier);playerHP=PLAYER_MAX_HP;playerDead=false;playerInvuln=1.0;deathTimer=0;deathPlane?.setEnabled?.(false);hudPlane?.setEnabled?.(true);setMusicMode(currentMapProgress().level>=10?"boss":"normal");gameMode="map";buildRuntimeMap(gameState.selectedMap);mirror.setEnabled(false);mirrorFrame.setEnabled(false);lobbyScreen.setEnabled(false);if(xrCamera){const p=getMapSpawn();xrCamera.position.set(p.x,.08,p.z);bodyVelocity.set(0,0,0);keepRigAboveFloor();}if(npc?.root)npc.root.dispose();createNpc();configureNpcForCurrentLevel();npc.root.setEnabled(true);npc.root.position.copyFrom(getNpcSpawnPosition());configureExtraSquad();applyBatLook();applySkinLook();}
  function applyBatLook(){const b=selectedBatData(),c=BABYLON.Color3.FromHexString(b.color);batWood.diffuseColor=c;batWood.emissiveColor=c.scale(b.rarity==="Mythic"?.14:b.rarity==="Legendary"?.08:.02);}

  let chestRoot=null;
  let cosmeticRoot=null;
  const cosmeticMeshes={};

  function ensureCosmeticRoot(){
    if(cosmeticRoot)return cosmeticRoot;
    if(!chestRoot)return null;
    cosmeticRoot=new BABYLON.TransformNode("cosmeticRoot",scene);
    cosmeticRoot.parent=chestRoot;
    return cosmeticRoot;
  }

  function makeCosmeticMesh(id){
    if(cosmeticMeshes[id])return cosmeticMeshes[id];
    const root=ensureCosmeticRoot();if(!root)return null;
    let m=null;
    if(id==="capRed"||id==="capBlue"){
      m=BABYLON.MeshBuilder.CreateCylinder("cos_"+id,{height:.10,diameter:.34,tessellation:18},scene);
      m.position.set(0,.69,.18);m.rotation.z=0;
      m.material=mkMat("mat_"+id,id==="capRed"?"#d94a4a":"#4779d9");
    }else if(id==="sunglasses"||id==="pixelShades"){
      m=BABYLON.MeshBuilder.CreateBox("cos_"+id,{width:.30,height:.07,depth:.045},scene);
      m.position.set(0,.56,.24);
      m.material=mkMat("mat_"+id,id==="pixelShades"?"#111111":"#2d2d35");
    }else if(id==="headphones"){
      m=BABYLON.MeshBuilder.CreateTorus("cos_"+id,{diameter:.42,thickness:.045,tessellation:20},scene);
      m.position.set(0,.61,.14);m.rotation.x=Math.PI/2;
      m.material=mkMat("mat_"+id,"#4b5563");
    }else if(id==="crown"||id==="voidCrown"){
      m=BABYLON.MeshBuilder.CreateCylinder("cos_"+id,{height:.16,diameterTop:.24,diameterBottom:.32,tessellation:6},scene);
      m.position.set(0,.76,.17);
      m.material=mkMat("mat_"+id,id==="voidCrown"?"#4b2b68":"#d4af37");
    }else if(id==="angelHalo"){
      m=BABYLON.MeshBuilder.CreateTorus("cos_"+id,{diameter:.38,thickness:.025,tessellation:24},scene);
      m.position.set(0,.88,.16);m.rotation.x=Math.PI/2;
      m.material=mkMat("mat_"+id,"#f7e98a");
    }else if(id==="backpack"){
      m=BABYLON.MeshBuilder.CreateBox("cos_"+id,{width:.30,height:.38,depth:.15},scene);
      m.position.set(0,-.04,-.33);
      m.material=mkMat("mat_"+id,"#4f6a5e");
    }else if(id==="goldChain"){
      m=BABYLON.MeshBuilder.CreateTorus("cos_"+id,{diameter:.28,thickness:.025,tessellation:20},scene);
      m.position.set(0,.22,.28);m.rotation.x=Math.PI/2;
      m.material=mkMat("mat_"+id,"#d4af37");
    }else if(id==="ownerCrown"){
      m=new BABYLON.TransformNode("cos_"+id,scene);
      const black=mkMat("ownerCrownBlack","#070a12");
      const cyan=mkMat("ownerCrownCyan","#26ecff");
      const gold=mkMat("ownerCrownGold","#ffd76a");
      cyan.emissiveColor=BABYLON.Color3.FromHexString("#26ecff").scale(.9);
      gold.emissiveColor=BABYLON.Color3.FromHexString("#ffd76a").scale(.45);
      const base=BABYLON.MeshBuilder.CreateCylinder("ownerCrownBase",{height:.09,diameterTop:.29,diameterBottom:.36,tessellation:10},scene);
      base.parent=m;base.position.set(0,.77,.17);base.material=black;
      const ring=BABYLON.MeshBuilder.CreateTorus("ownerCrownRing",{diameter:.39,thickness:.03,tessellation:24},scene);
      ring.parent=m;ring.position.set(0,.83,.17);ring.rotation.x=Math.PI/2;ring.material=cyan;
      for(let i=0;i<6;i++){
        const spike=BABYLON.MeshBuilder.CreateCylinder("ownerCrownSpike"+i,{height:.18,diameterTop:0,diameterBottom:.07,tessellation:6},scene);
        const a=i/6*Math.PI*2;
        spike.parent=m;spike.position.set(Math.cos(a)*.13,.92,.17+Math.sin(a)*.13);spike.material=i%2?gold:cyan;
      }
    }else if(id==="ownerVisor"){
      m=new BABYLON.TransformNode("cos_"+id,scene);
      const dark=mkMat("ownerVisorDark","#070914");
      const cyan=mkMat("ownerVisorCyan","#20e7ff");
      const pink=mkMat("ownerVisorPink","#ff46df");
      cyan.emissiveColor=BABYLON.Color3.FromHexString("#20e7ff").scale(.85);
      pink.emissiveColor=BABYLON.Color3.FromHexString("#ff46df").scale(.85);
      const body=BABYLON.MeshBuilder.CreateBox("ownerVisorBody",{width:.34,height:.085,depth:.045},scene);
      body.parent=m;body.position.set(0,.56,.255);body.material=dark;
      const l=BABYLON.MeshBuilder.CreateBox("ownerVisorLeft",{width:.145,height:.035,depth:.012},scene);
      l.parent=m;l.position.set(-.09,.56,.284);l.rotation.z=-.08;l.material=cyan;
      const r=BABYLON.MeshBuilder.CreateBox("ownerVisorRight",{width:.145,height:.035,depth:.012},scene);
      r.parent=m;r.position.set(.09,.56,.284);r.rotation.z=.08;r.material=pink;
    }else if(id==="ownerCore"){
      m=new BABYLON.TransformNode("cos_"+id,scene);
      const cyan=mkMat("ownerCoreCyan","#14e7ff");
      const violet=mkMat("ownerCoreViolet","#965cff");
      cyan.emissiveColor=BABYLON.Color3.FromHexString("#14e7ff").scale(.95);
      violet.emissiveColor=BABYLON.Color3.FromHexString("#965cff").scale(.8);
      const ring=BABYLON.MeshBuilder.CreateTorus("ownerCoreRing",{diameter:.26,thickness:.035,tessellation:24},scene);
      ring.parent=m;ring.position.set(0,.22,.30);ring.rotation.x=Math.PI/2;ring.material=cyan;
      const orb=BABYLON.MeshBuilder.CreateSphere("ownerCoreOrb",{diameter:.10,segments:12},scene);
      orb.parent=m;orb.position.set(0,.22,.315);orb.material=violet;
    }else if(id==="ownerCape"){
      m=new BABYLON.TransformNode("cos_"+id,scene);
      const dark=mkMat("ownerCapeDark","#080a16");
      const edge=mkMat("ownerCapeEdge","#ff46df");
      edge.emissiveColor=BABYLON.Color3.FromHexString("#ff46df").scale(.75);
      const cape=BABYLON.MeshBuilder.CreateBox("ownerCapeBody",{width:.48,height:.62,depth:.035},scene);
      cape.parent=m;cape.position.set(0,-.02,-.40);cape.rotation.x=-.10;cape.material=dark;
      const stripe1=BABYLON.MeshBuilder.CreateBox("ownerCapeStripe1",{width:.38,height:.045,depth:.012},scene);
      stripe1.parent=m;stripe1.position.set(0,.17,-.425);stripe1.material=edge;
      const stripe2=BABYLON.MeshBuilder.CreateBox("ownerCapeStripe2",{width:.30,height:.035,depth:.012},scene);
      stripe2.parent=m;stripe2.position.set(0,-.10,-.425);stripe2.material=edge;
    }
    if(m){m.parent=root;m.setEnabled(false);cosmeticMeshes[id]=m;}
    return m;
  }

  function applyPotatoColor(){
    const col=BABYLON.Color3.FromHexString(potatoRgbHex(gameState.potatoRGB));
    potatoMat.diffuseColor=col;
    potatoLightMat.diffuseColor=BABYLON.Color3.Lerp(col,new BABYLON.Color3(1,1,1),.18);
  }

  function applyCosmetics(){
    if(!ensureCosmeticRoot())return;
    Object.values(cosmeticMeshes).forEach(m=>m?.setEnabled?.(false));
    for(const slot of ["head","face","chest","back"]){
      const id=gameState.equippedCosmetics?.[slot];
      if(!id||!gameState.cosmetics?.[id])continue;
      const m=makeCosmeticMesh(id);
      m?.setEnabled?.(true);
    }
  }

  function cyclePotatoRgb(channel){
    if(!["r","g","b"].includes(channel))return;
    gameState.potatoRGB[channel]=(gameState.potatoRGB[channel]+1)%10;
    applySkinLook();saveGame();
  }

  function buyOrEquipCosmetic(id){
    const c=COSMETIC_CATALOG.find(x=>x.id===id);if(!c)return false;
    if(gameState.cosmetics[id]){
      gameState.equippedCosmetics[c.slot]=gameState.equippedCosmetics[c.slot]===id?null:id;
      applyCosmetics();saveGame();return true;
    }
    if(c.type==="gem"){
      if(gameState.gems<c.price){lastLobbyMessage="NOT ENOUGH GEMS";return false;}
      gameState.gems-=c.price;gameState.cosmetics[id]=1;gameState.equippedCosmetics[c.slot]=id;
      previewCosmeticId=null;applyCosmetics();saveGame();return true;
    }
    if(c.type==="owner"){
      lastLobbyMessage="OWNER GIFT ONLY • GET IT FROM THE OWNER IN A PUBLIC LOBBY";
      return false;
    }
    lastLobbyMessage=`PREMIUM ${c.price} • META IAP NOT CONNECTED YET`;
    updateCosmeticPreview();
    return false;
  }

  function applySkinLook(){
    applyPotatoColor();
    const s=SKIN_CATALOG.find(x=>x.id===gameState.selectedSkin)||SKIN_CATALOG[0];
    if(s?.color){
      const tint=BABYLON.Color3.FromHexString(s.color);
      potatoLightMat.diffuseColor=BABYLON.Color3.Lerp(potatoLightMat.diffuseColor,tint,.10);
    }
    applyCosmetics();
  }
  function activateLobby(){lastLobbyMessage="";if(gameState.pendingDuplicate){resolveDuplicate(["keep","coins","gems"][wrap(lobbyIndex,3)]);lobbyIndex=0;lastLobbyMessage="Duplicate choice saved.";refreshLobby();return;}if(lobbySub==="maps"){const ids=ownedMapIds();gameState.selectedMap=ids[wrap(lobbyIndex,ids.length)];saveGame();lobbySub="prematch";lobbyIndex=0;refreshLobby();return;}if(lobbySub==="bats"){const ids=ownedBatIds();gameState.selectedBat=ids[wrap(lobbyIndex,ids.length)];saveGame();applyBatLook();refreshLobby();return;}if(lobbySub==="skins"){const ids=ownedSkinIds();gameState.selectedSkin=ids[wrap(lobbyIndex,ids.length)];saveGame();applySkinLook();refreshLobby();return;}if(lobbySub==="cosmetics"){buyOrEquipCosmetic(COSMETIC_CATALOG[wrap(lobbyIndex,COSMETIC_CATALOG.length)].id);refreshLobby();return;}if(lobbySub==="colors"){cyclePotatoRgb(["r","g","b"][wrap(lobbyIndex,3)]);refreshLobby();return;}if(lobbySub==="bundles"){requestPaidProduct(BUNDLES[wrap(lobbyIndex,BUNDLES.length)]);refreshLobby();return;}if(lobbySub==="gemshop"){requestPaidProduct(GEM_PACKS[wrap(lobbyIndex,GEM_PACKS.length)]);refreshLobby();return;}if(lobbySub==="settings"){if(lobbyIndex===0)cycleAudioSetting("musicVolume");else if(lobbyIndex===1)cycleAudioSetting("chatVolume");else if(lobbyIndex===2)cycleAudioSetting("sfxVolume");else if(lobbyIndex===3)toggleCameraHeld();else lastLobbyMessage="Training area active — test movement, hits and blocks here.";refreshLobby();return;}if(lobbySub==="controls"){if(lobbyIndex===0)saveControlChoice("batHand",oppositeHand(batHandSide()));else if(lobbyIndex===1)saveControlChoice("dominantHand",oppositeHand(dominantHandSide()));else if(lobbyIndex===2)saveControlChoice("menuHand",oppositeHand(menuHandSide()));refreshLobby();return;}if(lobbySub==="prematch"){if(lobbyIndex===0)saveControlChoice("batHand",oppositeHand(batHandSide()));else if(lobbyIndex===1)saveControlChoice("dominantHand",oppositeHand(dominantHandSide()));else if(lobbyIndex===2)saveControlChoice("menuHand",oppositeHand(menuHandSide()));else startMap();refreshLobby();return;}if(lobbySub==="avatar"){gameState.settings.previewSpin=!gameState.settings.previewSpin;saveGame();refreshLobby();return;}if(lobbySub==="inspect"){const ids=ownedBatIds();const i=Math.max(0,ids.indexOf(gameState.selectedBat));gameState.selectedBat=ids[(i+1)%ids.length];saveGame();applyBatLook();refreshLobby();return;}if(lobbySub==="practice"){lastLobbyMessage=`BEST ${practiceDummyBestHit.toFixed(1)} m/s`;refreshLobby();return;}if(lobbySub==="difficulty"){cycleNpcDifficulty();refreshLobby();return;}if(lobbySub==="calibration"){cycleHandCalibration();refreshLobby();return;}if(lobbySub==="holster"){gameState.settings.holsterEnabled=!gameState.settings.holsterEnabled;if(!gameState.settings.holsterEnabled&&batHolstered)drawBatFromHolster();saveGame();refreshLobby();return;}if(lobbySub==="testmode"){if(gameState.settings.testMode)disableFreeTestMode();else enableFreeTestMode();refreshLobby();return;}if(lobbySub==="owner"){requestOwnerGiftDrop(OWNER_COSMETIC_IDS[wrap(lobbyIndex,OWNER_COSMETIC_IDS.length)]);refreshLobby();return;}if(lobbySub==="multi"){activateMultiplayerLobby();return;}if(lobbySub!=="main")return;const c=lobbySelection;if(c===0){lobbySub="maps";lobbyIndex=0;}else if(c>=1&&c<=4){const r=openCrate({1:"bat",2:"skin",3:"map",4:"gem"}[c]);lastLobbyMessage=r?.error||`OPENED: ${r.item.rarity} ${r.item.name}`;}else if(c===5){lobbySub="bats";lobbyIndex=0;}else if(c===6){lobbySub="skins";lobbyIndex=0;}else if(c===7){lobbySub="cosmetics";lobbyIndex=0;}else if(c===8){lobbySub="colors";lobbyIndex=0;}else if(c===9){const modes=["NORMAL","SURVIVAL","ENDLESS","HARDCORE"];gameState.mode=modes[(modes.indexOf(gameState.mode)+1)%modes.length];saveGame();if(net.isHost)broadcast(currentLobbyState());lastLobbyMessage=`Mode: ${gameState.mode}`;}else if(c===10){lastLobbyMessage=`DAILY ${missionShort()} • WEEKLY BOSSES ${gameState.weekly.boss.progress}/${gameState.weekly.boss.goal}`;}else if(c===11){lastLobbyMessage=`COLLECTION: ${ownedBatIds().length}/${BAT_CATALOG.length} bats • ${ownedSkinIds().length}/${SKIN_CATALOG.length} skins • ${ownedMapIds().length}/${MAP_CATALOG.length} maps • ${Object.keys(gameState.cosmetics).length}/${COSMETIC_CATALOG.length} cosmetics`;}else if(c===12)lobbySub="trading";else if(c===13){lobbySub="multi";lobbyIndex=0;}else if(c===14){lobbySub="bundles";lobbyIndex=0;}else if(c===15){lobbySub="settings";lobbyIndex=0;}else if(c===16){lobbySub="controls";lobbyIndex=0;}else if(c===17){lobbySub="avatar";lobbyIndex=0;}else if(c===18){lobbySub="inspect";lobbyIndex=0;}else if(c===19){lobbySub="practice";lobbyIndex=0;}else if(c===20){lobbySub="difficulty";lobbyIndex=0;}else if(c===21){lobbySub="calibration";lobbyIndex=0;}else if(c===22){lobbySub="holster";lobbyIndex=0;}else if(c===23){lobbySub="gemshop";lobbyIndex=0;}else if(c===24&&OWNER_ACCESS){lobbySub="owner";lobbyIndex=0;}refreshLobby();}
  function backLobby(){if(!gameState.pendingDuplicate&&lobbySub!=="main"){lobbySub="main";lobbyIndex=0;previewCosmeticId=null;applyCosmetics();refreshLobby();}}
  refreshLobby();
  setTimeout(()=>ensurePublicLobby(),350);

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
  const PLAYER_GRAVITY = -5.15;
  const PUSH_GAIN = 1.78;
  const MAX_PLAYER_SPEED = 8.8;
  const FLOOR_FORWARD_BOOST = 1.52;
  const FLOOR_SIDE_BOOST = 1.10;
  const FLOOR_LIFT_BOOST = 1.82;

  // ------------------------------------------------------------
  // Camera-fixed player HUD: always shows your own HP.
  // ------------------------------------------------------------
  const hudPlane = BABYLON.MeshBuilder.CreatePlane("playerHud",{width:.86,height:.20},scene);
  hudPlane.setEnabled(false);
  const hudTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(hudPlane,900,420);
  hudPlane.isPickable=false;
  hudPlane.alwaysSelectAsActiveMesh=true;
  hudPlane.renderingGroupId=3;
  if(hudPlane.material){
    hudPlane.material.backFaceCulling=false;
    hudPlane.material.disableDepthWrite=true;
    hudPlane.material.disableLighting=true;
  }

  const hudBg = new BABYLON.GUI.Rectangle();
  hudBg.cornerRadius=16;
  hudBg.color="#ffffff";
  hudBg.thickness=2;
  hudBg.background="#0b1220CC";
  hudTex.addControl(hudBg);

  const hudStack = new BABYLON.GUI.StackPanel();
  hudStack.paddingTop="8px";
  hudStack.paddingBottom="8px";
  hudStack.paddingLeft="14px";
  hudStack.paddingRight="14px";
  hudBg.addControl(hudStack);

  const youHpText = new BABYLON.GUI.TextBlock();
  youHpText.text="HP 100 / 100";
  youHpText.color="white";
  youHpText.fontSize=30;
  youHpText.fontWeight="900";
  youHpText.height="42px";
  hudStack.addControl(youHpText);

  const hpBarBg = new BABYLON.GUI.Rectangle();
  hpBarBg.height="18px";
  hpBarBg.cornerRadius=9;
  hpBarBg.thickness=0;
  hpBarBg.background="#3f1d1d";
  hudStack.addControl(hpBarBg);

  const hpBar = new BABYLON.GUI.Rectangle();
  hpBar.horizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.width=1;
  hpBar.thickness=0;
  hpBar.cornerRadius=9;
  hpBar.background="#22c55e";
  hpBarBg.addControl(hpBar);

  const gameInfoText=new BABYLON.GUI.TextBlock();
  gameInfoText.text="";
  gameInfoText.color="#dbeafe";gameInfoText.fontSize=1;gameInfoText.fontWeight="700";gameInfoText.height="0px";gameInfoText.isVisible=false;
  hudStack.addControl(gameInfoText);

  const missionText=new BABYLON.GUI.TextBlock();
  missionText.text="";missionText.color="#cbd5e1";missionText.fontSize=1;missionText.height="0px";missionText.isVisible=false;
  hudStack.addControl(missionText);

  const damageFlash = BABYLON.MeshBuilder.CreatePlane("damageFlash",{width:3.4,height:2.0},scene);
  damageFlash.setEnabled(false);
  const flashTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(damageFlash,800,450);
  damageFlash.isPickable=false;
  damageFlash.alwaysSelectAsActiveMesh=true;
  damageFlash.renderingGroupId=3;
  if(damageFlash.material){
    damageFlash.material.backFaceCulling=false;
    damageFlash.material.disableDepthWrite=true;
    damageFlash.material.disableLighting=true;
  }
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
  deathPlane.isPickable=false;
  deathPlane.alwaysSelectAsActiveMesh=true;
  deathPlane.renderingGroupId=3;
  if(deathPlane.material){
    deathPlane.material.backFaceCulling=false;
    deathPlane.material.disableDepthWrite=true;
    deathPlane.material.disableLighting=true;
  }
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

  const blockPlane=BABYLON.MeshBuilder.CreatePlane("blockPlane",{width:1.1,height:.42},scene);
  blockPlane.setEnabled(false);
  const blockTex=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(blockPlane,700,250);
  blockPlane.isPickable=false;
  blockPlane.alwaysSelectAsActiveMesh=true;
  blockPlane.renderingGroupId=3;
  if(blockPlane.material){
    blockPlane.material.backFaceCulling=false;
    blockPlane.material.disableDepthWrite=true;
    blockPlane.material.disableLighting=true;
  }
  const blockRect=new BABYLON.GUI.Rectangle();
  blockRect.background="#0f172aDD";
  blockRect.color="#67e8f9";
  blockRect.thickness=5;
  blockRect.cornerRadius=30;
  blockTex.addControl(blockRect);

  const blockText=new BABYLON.GUI.TextBlock();
  blockText.text="BLOCK!";
  blockText.color="#ffffff";
  blockText.fontSize=88;
  blockText.fontWeight="900";
  blockRect.addControl(blockText);

  let blockFlashTimer=0;

  function updatePlayerHud() {
    youHpText.text=playerDowned
      ? `DOWNED ${Math.max(0,Math.ceil(downedTimer))}s`
      : `HP ${Math.max(0,Math.ceil(playerHP))} / ${PLAYER_MAX_HP}`;
    hpBar.width=Math.max(.001,playerHP/PLAYER_MAX_HP);
    hpBar.background = playerHP>55 ? "#22c55e" : playerHP>25 ? "#f59e0b" : "#ef4444";
    gameInfoText.text=`${gameState.coins} COINS • ${gameState.gems} GEMS • ${selectedBatData().name} LV ${selectedBatState().level}${(net.connected||net.isHost)?" • PARTY "+gameState.partySize+"/"+(gameMode==="lobby"?8:4):""}`;
    missionText.text=mapEventTextTimer>0?`${mapEventText}`:`${waveModifier!=="NONE"?"MOD: "+waveModifier:""}`;
    missionText.isVisible=!!missionText.text;missionText.fontSize=18;missionText.height=missionText.text?"24px":"0px";
    updateStatsUI();
  }

  function attachHud() {
    if (!xrCamera) return;
    hudPlane.parent=xrCamera;
    hudPlane.position.set(0,-.62,1.02);
    hudPlane.rotation.set(0,Math.PI,0);
    hudPlane.scaling.set(.95,.95,1);
    hudPlane.setEnabled(true);

    damageFlash.parent=xrCamera;
    damageFlash.position.set(0,0,1.05);
    damageFlash.rotation.set(0,Math.PI,0);

    deathPlane.parent=xrCamera;
    deathPlane.position.set(0,0,1.45);
    deathPlane.rotation.set(0,Math.PI,0);

    blockPlane.parent=xrCamera;
    blockPlane.position.set(.48,.18,1.15);
    blockPlane.rotation.set(0,Math.PI,0);
    blockPlane.setEnabled(false);
  }

  function hurtPlayer(amount, fromWorldPos) {
    if (playerDead || playerDowned || playerInvuln>0) return;
    playerHP=Math.max(0,playerHP-amount);
    playerInvuln=.42;
    damageFlashTimer=.18;
    if(isInXR()) damageFlash.setEnabled(true);

    let away=playerWorldPos().subtract(fromWorldPos);
    away.y=0;
    if (away.lengthSquared()<.001) away.set(0,0,-1);
    away.normalize();

    bodyVelocity.addInPlace(
      away.scale(2.8).add(new BABYLON.Vector3(0,.72,0))
    );

    pulse(hands.left,.92,115);
    pulse(hands.right,.92,115);
    updatePlayerHud();

    if (playerHP<=0 && !playerDowned) {
      if(enterDownedState()){updatePlayerHud();return;}
      playerDead=true;
      deathTimer=3.0;
      if(isInXR()){
        deathPlane.setEnabled(true);
        hudPlane.setEnabled(false);
      }
      chestRoot.setEnabled(false);
    }
  }

  function respawnPlayer() {
    playerDowned=false;downedTimer=0;playerHP=PLAYER_MAX_HP;
    playerDead=false;
    playerInvuln=1.5;
    deathPlane.setEnabled(false);
    hudPlane.setEnabled(true);
    bodyVelocity.set(0,0,0);
    if (xrCamera) {
      const sp=getMapSpawn();
      xrCamera.position.set(sp.x,.08,sp.z);
      keepRigAboveFloor();
      resolvePlayerWorldCollision();
    }
    if(chestRoot)chestRoot.setEnabled(!!xrCamera);
    updatePlayerHud();
  }

  // ------------------------------------------------------------
  // Potato player body — visual only.
  // The actual player collision remains head + chest only.
  // ------------------------------------------------------------
  chestRoot = new BABYLON.TransformNode("potatoBodyRoot",scene);

  const potatoBody=BABYLON.MeshBuilder.CreateSphere("playerPotatoBody",{
    diameter:.54,segments:20
  },scene);
  potatoBody.parent=chestRoot;
  potatoBody.position.set(0,-.07,0);
  potatoBody.scaling.set(.78,1.02,.68);
  potatoBody.material=potatoMat;

  // Potato dimples.
  const potatoDimples=[];
  [
    [-.16,.08,-.24],
    [.15,.01,-.245],
    [-.08,-.18,-.23],
    [.11,.20,-.20]
  ].forEach((p,i)=>{
    const d=BABYLON.MeshBuilder.CreateSphere("playerPotatoDimple"+i,{
      diameter:.032,segments:8
    },scene);
    d.parent=potatoBody;
    d.position.set(p[0],p[1],p[2]);
    d.scaling.set(1,.55,.30);
    d.material=potatoDarkMat;
    potatoDimples.push(d);
  });

  // Big potato butt cheeks. These are visual only and never affect collisions.
  const buttRoot=new BABYLON.TransformNode("potatoButtRoot",scene);
  buttRoot.parent=chestRoot;
  buttRoot.position.set(0,-.24,-.24);

  const buttL=BABYLON.MeshBuilder.CreateSphere("potatoButtL",{
    diameter:.34,segments:18
  },scene);
  buttL.parent=buttRoot;
  buttL.position.set(-.13,0,.05);
  buttL.scaling.set(1.00,.88,.82);
  buttL.material=potatoLightMat;

  const buttR=buttL.clone("potatoButtR");
  buttR.parent=buttRoot;
  buttR.position.x=.13;

  let buttJiggleX=0;
  let buttJiggleY=0;
  let buttJiggleVX=0;
  let buttJiggleVY=0;
  let potatoBodyLastPos=null;

  chestRoot.setEnabled(false);
  ensureCosmeticRoot();applyPotatoColor();applyCosmetics();

  function updateBodyVisual(dt=1/72) {
    if(!xrCamera || playerDead){
      chestRoot.setEnabled(false);
      return;
    }

    chestRoot.setEnabled(true);

    const head=xrCamera.globalPosition.clone();
    let f=xrCamera.getForwardRay(1).direction.clone();
    f.y=0;
    if(f.lengthSquared()<.001) f.set(0,0,1);
    f.normalize();

    // Stay clearly below the headset so the potato never fills your face.
    const bodyPos=new BABYLON.Vector3(
      head.x - f.x*.18,
      Math.max(.76,head.y-.66),
      head.z - f.z*.18
    );

    chestRoot.position.copyFrom(bodyPos);
    chestRoot.rotation.y=Math.atan2(f.x,f.z);

    // Small potato wobble from movement.
    const speedXZ=Math.hypot(bodyVelocity.x,bodyVelocity.z);
    const wobble=Math.min(.055,speedXZ*.006);
    potatoBody.rotation.z=Math.sin(performance.now()*.008)*wobble;
    potatoBody.rotation.x=Math.cos(performance.now()*.006)*wobble*.65;

    // Soft spring jiggle. Visual only = no extra physics solver/glitches.
    let accelX=0,accelY=0;
    if(potatoBodyLastPos){
      const move=bodyPos.subtract(potatoBodyLastPos);
      accelX=BABYLON.Scalar.Clamp(-move.x*42,-.32,.32);
      accelY=BABYLON.Scalar.Clamp(-move.y*38,-.28,.28);
    }
    potatoBodyLastPos=bodyPos.clone();

    const spring=24;
    const damping=8.5;
    buttJiggleVX+=(accelX - buttJiggleX*spring)*dt;
    buttJiggleVY+=(accelY - buttJiggleY*spring)*dt;
    buttJiggleVX*=Math.exp(-damping*dt);
    buttJiggleVY*=Math.exp(-damping*dt);
    buttJiggleX+=buttJiggleVX;
    buttJiggleY+=buttJiggleVY;

    buttJiggleX=BABYLON.Scalar.Clamp(buttJiggleX,-.075,.075);
    buttJiggleY=BABYLON.Scalar.Clamp(buttJiggleY,-.055,.055);

    buttL.position.x=-.13+buttJiggleX;
    buttR.position.x=.13+buttJiggleX;
    buttL.position.y=buttJiggleY;
    buttR.position.y=-buttJiggleY*.72;

    const squash=Math.min(.10,Math.abs(buttJiggleY)*1.25);
    buttL.scaling.y=.88-squash;
    buttR.scaling.y=.88+squash*.55;
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
    const h=playerWorldPos();
    return [
      {name:"head",center:h.clone(),radius:.135},
      // Body collision now ends at the chest: no hip/waist hitbox.
      {name:"chest",center:h.add(new BABYLON.Vector3(0,-.34,0)),radius:.20}
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

  function segmentSegmentDistance(p1,q1,p2,q2) {
    const d1=q1.subtract(p1);
    const d2=q2.subtract(p2);
    const r=p1.subtract(p2);

    const a=BABYLON.Vector3.Dot(d1,d1);
    const e=BABYLON.Vector3.Dot(d2,d2);
    const f=BABYLON.Vector3.Dot(d2,r);

    let s=0,t=0;

    if(a<=.000001 && e<=.000001){
      return BABYLON.Vector3.Distance(p1,p2);
    }

    if(a<=.000001){
      s=0;
      t=Math.max(0,Math.min(1,f/e));
    }else{
      const c=BABYLON.Vector3.Dot(d1,r);

      if(e<=.000001){
        t=0;
        s=Math.max(0,Math.min(1,-c/a));
      }else{
        const b=BABYLON.Vector3.Dot(d1,d2);
        const denom=a*e-b*b;

        if(Math.abs(denom)>.000001){
          s=Math.max(0,Math.min(1,(b*f-c*e)/denom));
        }else{
          s=0;
        }

        t=(b*s+f)/e;

        if(t<0){
          t=0;
          s=Math.max(0,Math.min(1,-c/a));
        }else if(t>1){
          t=1;
          s=Math.max(0,Math.min(1,(b-c)/a));
        }
      }
    }

    const c1=p1.add(d1.scale(s));
    const c2=p2.add(d2.scale(t));
    return BABYLON.Vector3.Distance(c1,c2);
  }

  // ------------------------------------------------------------
  // Hands
  // ------------------------------------------------------------
  const hands={
    left:{controller:null,node:null,mesh:null,trackLast:null,contact:false,anchor:null,normal:null,plantTrack:null,waitClear:false},
    right:{controller:null,node:null,mesh:null,trackLast:null,contact:false,anchor:null,normal:null,plantTrack:null,waitClear:false}
  };

  function makeHand(side) {
    const root=new BABYLON.TransformNode(side+"PotatoMitten",scene);

    // Chunky mitten-style potato hand.
    const palm=BABYLON.MeshBuilder.CreateSphere(side+"MittenPalm",{
      diameter:.155,segments:18
    },scene);
    palm.parent=root;
    palm.position.set(0,0,.020);
    palm.scaling.set(.95,.80,1.18);
    palm.material=potatoMat;

    // Big fused finger pad instead of separate human fingers.
    const fingerPad=BABYLON.MeshBuilder.CreateCapsule(side+"MittenFingers",{
      height:.125,radius:.040,tessellation:12
    },scene);
    fingerPad.parent=root;
    fingerPad.rotation.x=Math.PI/2;
    fingerPad.position.set(0,.002,.115);
    fingerPad.scaling.set(1.25,.78,1);
    fingerPad.material=potatoLightMat;

    // Round thumb.
    const thumb=BABYLON.MeshBuilder.CreateSphere(side+"MittenThumb",{
      diameter:.067,segments:12
    },scene);
    thumb.parent=root;
    thumb.position.set(side==="left"?.080:-.080,-.018,.035);
    thumb.scaling.set(1.05,.78,.95);
    thumb.material=potatoLightMat;

    // Little potato eyes/dimples.
    const spots=[
      [-.038,.030,.070],
      [.040,-.025,.067],
      [0,.042,-.030],
      [side==="left"?.055:-.055,.018,-.020]
    ];
    spots.forEach((p,i)=>{
      const d=BABYLON.MeshBuilder.CreateSphere(side+"MittenDimple"+i,{
        diameter:.016,segments:7
      },scene);
      d.parent=root;
      d.position.set(p[0],p[1],p[2]);
      d.scaling.set(1,.45,.32);
      d.material=potatoDarkMat;
    });

    root.setEnabled(false);
    return root;
  }
  hands.left.mesh=makeHand("left");
  hands.right.mesh=makeHand("right");

  async function pulse(h,intensity,duration) {
    intensity*=gameState.settings?.hapticStrength??.85;
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

  const HAND_RADIUS=.105;
  let groundSlamCooldown=0;
  const GROUND_SLAM_MIN_SPEED=2.55;
  const GROUND_SLAM_MAX_BOOST=4.15;
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
  function calibratedHandWorld(h){
    if(!h?.node)return handWorld(h);
    const raw=h.node.getAbsolutePosition?.()||h.node.position;
    if(!xrCamera)return raw.clone();
    const head=xrCamera.globalPosition||xrCamera.position;
    const scale=BABYLON.Scalar.Clamp(Number(gameState.settings.handReach)||1,.85,1.15);
    return head.add(raw.subtract(head).scale(scale));
  }
  function handTrack(h){return calibratedHandWorld(h);}

  function safeVisibleHandPosition(pos){
    const p=pos.clone();

    // Office floor top is around y=0. Never render the potato hand below it.
    const floorSafeY=HAND_RADIUS+.020;
    if(p.y<floorSafeY) p.y=floorSafeY;

    return p;
  }

  function updateHandLocomotion(h,worldPos,trackPos,dt) {
    let didGroundSlam=false;
    let c=surfaceContact(worldPos);

    if(!c && worldPos.y<HAND_RADIUS+.025){
      c={
        surface:ground,
        point:new BABYLON.Vector3(worldPos.x,0,worldPos.z),
        normal:new BABYLON.Vector3(0,1,0)
      };
    }

    if (h.waitClear && !c) h.waitClear=false;

    if (!h.contact && c && !h.waitClear) {
      h.contact=true;
      h.normal=c.normal.clone();
      h.anchor=c.point.add(h.normal.scale(HAND_RADIUS+.014));
      h.plantTrack=trackPos.clone();
      h.mesh.position.copyFrom(safeVisibleHandPosition(h.anchor));

      // One-shot hard ground slam. Normal gravity stays active after the launch.
      // It only fires on a fresh floor contact, so landing never auto-bounces.
      const isFloorLike=h.normal.y>.72;
      let slamSpeed=0;
      if(h.trackLast){
        const handDelta=trackPos.subtract(h.trackLast);
        slamSpeed=Math.max(0,-BABYLON.Vector3.Dot(handDelta,h.normal)/Math.max(dt,.008));
      }

      if(isFloorLike && slamSpeed>=GROUND_SLAM_MIN_SPEED && groundSlamCooldown<=0){
        const t=BABYLON.Scalar.Clamp((slamSpeed-GROUND_SLAM_MIN_SPEED)/4.5,0,1);
        const upBoost=BABYLON.Scalar.Lerp(1.55,GROUND_SLAM_MAX_BOOST,t);

        const hv=h.trackLast.subtract(trackPos).scale(1/Math.max(dt,.008));
        hv.y=0;
        if(hv.length()>4.8)hv.normalize().scaleInPlace(4.8);

        bodyVelocity.x+=hv.x*.46;
        bodyVelocity.z+=hv.z*.46;
        bodyVelocity.y=Math.max(bodyVelocity.y,upBoost);
        didGroundSlam=true;

        groundSlamCooldown=.28;
        pulse(h,.85,75);
      }else{
        pulse(h,.35,30);
      }
    }

    if (h.contact && h.normal && h.plantTrack && h.trackLast && !didGroundSlam) {
      const n=h.normal;
      const fromPlant=trackPos.subtract(h.plantTrack);
      const outward=BABYLON.Vector3.Dot(fromPlant,n);

      // Fast reliable release: lift only ~2 cm away from the surface.
      if (outward>.030 || BABYLON.Vector3.Distance(worldPos,h.anchor)>.34) {
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

        let effective=tangent.add(into.scale(1.18));

        // Stronger arms: pushing DOWN into the floor gives a stronger lift.
        if(n.y>.60 && normalDelta<0){
          const liftInto=n.scale(normalDelta*FLOOR_LIFT_BOOST);
          effective=tangent.add(liftInto);
        }

        let rigDelta=effective.scale(-PUSH_GAIN);

        // Floor pushes get a forward-biased assist.
        // Pulling your planted hand backward now moves you forward more easily.
        if(n.y>.60 && xrCamera){
          let forward=xrCamera.getForwardRay(1).direction.clone();
          forward.y=0;
          if(forward.lengthSquared()>.001){
            forward.normalize();

            const forwardAmount=BABYLON.Vector3.Dot(rigDelta,forward);
            const forwardPart=forward.scale(forwardAmount);
            const sidePart=rigDelta.subtract(forwardPart);

            if(forwardAmount>0){
              rigDelta=forwardPart.scale(FLOOR_FORWARD_BOOST)
                .add(sidePart.scale(FLOOR_SIDE_BOOST));
            }else{
              rigDelta=forwardPart.add(sidePart.scale(FLOOR_SIDE_BOOST));
            }
          }
        }

        const max=.155;
        if (rigDelta.length()>max) rigDelta=rigDelta.normalize().scale(max);

        if (rigDelta.length()>.0010) {
          xrCamera.position.addInPlace(rigDelta);
          keepRigAboveFloor();

          const impulse=rigDelta.scale(1/Math.max(dt,.008));
          bodyVelocity=BABYLON.Vector3.Lerp(bodyVelocity,impulse,.18);
          if (bodyVelocity.length()>MAX_PLAYER_SPEED) {
            bodyVelocity=bodyVelocity.normalize().scale(MAX_PLAYER_SPEED);
          }
          bodyVelocity.x=BABYLON.Scalar.Clamp(bodyVelocity.x,-7.2,7.2);
          bodyVelocity.y=BABYLON.Scalar.Clamp(bodyVelocity.y,-6.8,7.0);
          bodyVelocity.z=BABYLON.Scalar.Clamp(bodyVelocity.z,-7.2,7.2);
        }
      }
    }

    if (h.contact && h.anchor) {
      h.mesh.position.copyFrom(safeVisibleHandPosition(h.anchor));
    } else {
      const vc=surfaceContact(worldPos);
      if (vc) h.mesh.position.copyFrom(safeVisibleHandPosition(vc.point.add(vc.normal.scale(HAND_RADIUS+.012))));
      else h.mesh.position.copyFrom(safeVisibleHandPosition(worldPos));
    }

    h.trackLast=trackPos.clone();
  }

  // ------------------------------------------------------------
  // Detailed player bat
  // ------------------------------------------------------------
  const batRoot=new BABYLON.TransformNode("batRoot",scene);

  const batWood=mkMat("batWood","#9b6136");
  const batDark=mkMat("batDark","#3d2618");
  const batMetal=mkMat("batMetal","#cbd5e1");
  const batTape=mkMat("batTape","#171b22");
  batWood.specularColor=new BABYLON.Color3(.22,.13,.07);
  batWood.specularPower=26;
  batMetal.specularColor=new BABYLON.Color3(.95,.95,.95);
  batMetal.specularPower=72;

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

  for(let i=0;i<4;i++){
    const grain=BABYLON.MeshBuilder.CreateTorus("batGrain"+i,{
      diameter:.108-i*.004,
      thickness:.0045,
      tessellation:18
    },scene);
    grain.parent=batRoot;
    grain.rotation.x=Math.PI/2;
    grain.position.z=.18+i*.145;
    grain.material=batDark;
  }

  const knob=BABYLON.MeshBuilder.CreateSphere("batKnob",{
    diameter:.09,segments:14
  },scene);
  knob.parent=batRoot;
  knob.position.z=-.405;
  knob.scaling.z=.65;
  knob.material=batDark;

  batRoot.setEnabled(false);

  let batTipLast=null;
  let batBaseLast=null;
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

  function audioCtx(){
    try{
      return playImpactSound.ctx || (
        playImpactSound.ctx=new (window.AudioContext||window.webkitAudioContext)()
      );
    }catch(_){return null;}
  }

  let musicRunning=false,musicTimer=null,musicStep=0,musicMode="normal";
  function playMusicNote(freq,dur=.22,vol=.055,type="triangle"){
    const ac=audioCtx();if(!ac||!musicRunning)return;
    const mv=gameState.settings?.musicVolume??.5;if(mv<=0)return;
    try{
      if(ac.state==="suspended")ac.resume();
      const o=ac.createOscillator(),g=ac.createGain(),now=ac.currentTime;
      o.type=type;o.frequency.value=freq;
      g.gain.setValueAtTime(Math.max(.0001,vol*mv),now);
      g.gain.exponentialRampToValueAtTime(.0001,now+dur);
      o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+dur+.02);
    }catch(_){}
  }
  function setMusicMode(mode){
    const next=mode==="boss"?"boss":"normal";
    if(next!==musicMode){musicMode=next;musicStep=0;}
  }
  function startBackgroundMusic(){
    if(musicRunning)return;
    musicRunning=true;
    const normal=[110,146.83,164.81,146.83,123.47,164.81,196,164.81];
    const boss=[82.41,82.41,98.00,73.42,82.41,110.00,98.00,73.42];
    const tick=()=>{
      if(!musicRunning)return;
      const isBoss=musicMode==="boss";
      const seq=isBoss?boss:normal;
      const f=seq[musicStep%seq.length];
      if(isBoss){
        playMusicNote(f,.22,.072,"sawtooth");
        if(musicStep%2===0)playMusicNote(f/2,.34,.045,"square");
        if(musicStep%4===3)playMusicNote(f*1.5,.12,.028,"triangle");
      }else{
        playMusicNote(f,.28,.05,"triangle");
        if(musicStep%4===0)playMusicNote(f/2,.42,.028,"sine");
      }
      musicStep++;
      musicTimer=setTimeout(tick,isBoss?300:430);
    };
    tick();
  }
  function stopBackgroundMusic(){musicRunning=false;if(musicTimer){clearTimeout(musicTimer);musicTimer=null;}}

  function noiseBuffer(ac,duration=.16){
    const len=Math.max(1,Math.floor(ac.sampleRate*duration));
    const b=ac.createBuffer(1,len,ac.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    return b;
  }

  function playImpactSound(kind="body",strength=.5){
    const ac=audioCtx(); if(!ac) return;
    const sfxVol=gameState.settings?.sfxVolume??.75;
    if(sfxVol<=0)return;
    strength=Math.max(.05,Math.min(1.3,strength))*sfxVol;
    try{
      if(ac.state==="suspended") ac.resume();
      const now=ac.currentTime;

      if(kind==="body"){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type="sine";o.frequency.setValueAtTime(105,now);
        o.frequency.exponentialRampToValueAtTime(48,now+.11);
        g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(.10*strength,now+.006);
        g.gain.exponentialRampToValueAtTime(.001,now+.14);
        o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+.15);
      }else if(kind==="wood" || kind==="plastic"){
        const src=ac.createBufferSource(),filter=ac.createBiquadFilter(),g=ac.createGain();
        src.buffer=noiseBuffer(ac,kind==="wood"?.11:.07);
        filter.type=kind==="wood"?"bandpass":"highpass";
        filter.frequency.value=kind==="wood"?440:900;
        g.gain.setValueAtTime((kind==="wood"?.10:.05)*strength,now);
        g.gain.exponentialRampToValueAtTime(.001,now+(kind==="wood"?.11:.07));
        src.connect(filter);filter.connect(g);g.connect(ac.destination);src.start(now);
      }else if(kind==="metal" || kind==="block"){
        for(const f of (kind==="block"?[520,880,1320]:[430,760,1150])){
          const o=ac.createOscillator(),g=ac.createGain();
          o.type="sine";o.frequency.value=f*(.93+Math.random()*.14);
          g.gain.setValueAtTime(.04*strength,now);
          g.gain.exponentialRampToValueAtTime(.001,now+(kind==="block"?.22:.16));
          o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+.24);
        }
      }else if(kind==="glass"){
        for(let i=0;i<5;i++){
          const o=ac.createOscillator(),g=ac.createGain(),delay=Math.random()*.045;
          o.type="sine";o.frequency.value=1500+Math.random()*2700;
          g.gain.setValueAtTime(.025*strength,now+delay);
          g.gain.exponentialRampToValueAtTime(.001,now+delay+.19);
          o.connect(g);g.connect(ac.destination);o.start(now+delay);o.stop(now+delay+.20);
        }
      }else if(kind==="ceramic"){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type="triangle";o.frequency.value=780;
        g.gain.setValueAtTime(.075*strength,now);g.gain.exponentialRampToValueAtTime(.001,now+.15);
        o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+.16);
      }else if(kind==="whoosh"){
        const src=ac.createBufferSource(),filter=ac.createBiquadFilter(),g=ac.createGain();
        src.buffer=noiseBuffer(ac,.16);filter.type="bandpass";filter.frequency.value=700;filter.Q.value=.5;
        g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(.035*strength,now+.06);
        g.gain.exponentialRampToValueAtTime(.001,now+.16);
        src.connect(filter);filter.connect(g);g.connect(ac.destination);src.start(now);
      }else if(kind==="step"){
        const o=ac.createOscillator(),g=ac.createGain();
        o.type="sine";o.frequency.value=70;
        g.gain.setValueAtTime(.045*strength,now);g.gain.exponentialRampToValueAtTime(.001,now+.06);
        o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+.07);
      }else if(kind==="slap"){
        const src=ac.createBufferSource(),bp=ac.createBiquadFilter(),peak=ac.createBiquadFilter(),g=ac.createGain();
        src.buffer=noiseBuffer(ac,.12);
        bp.type="bandpass";bp.frequency.value=980;bp.Q.value=.55;
        peak.type="peaking";peak.frequency.value=2100;peak.Q.value=1.1;peak.gain.value=3.8;
        g.gain.setValueAtTime(.001,now);
        g.gain.linearRampToValueAtTime(.16*strength,now+.008);
        g.gain.exponentialRampToValueAtTime(.001,now+.12);
        src.connect(bp);bp.connect(peak);peak.connect(g);g.connect(ac.destination);src.start(now);
      }
    }catch(_){}
  }

  function simpleHitSound(strong=false){
    playImpactSound(strong?"metal":"body",strong?1:.55);
  }

  function propSoundType(type){
    if(["desk","door","whiteboard"].includes(type)) return "wood";
    if(["chair","bin","printer","cooler","stapler","pencup"].includes(type)) return "metal";
    if(type==="mug") return "ceramic";
    if(["keyboard","mouse","mousepad","phone"].includes(type)) return "plastic";
    return "wood";
  }

  // ------------------------------------------------------------
  // NPC voice: no more embedded eSpeak robot audio.
  // Uses the best native browser/system voice the Quest exposes.
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // Crazy Office reaction audio.
  // No text-to-speech and no spoken words. Real scream clips can be added later.
  // ------------------------------------------------------------
  const HUMAN_VOICE_FILES_AVAILABLE=false; // set true after recorded scream files are added

  const NPC_VOICE_CLIPS={
    chase:["voice/chase1.mp3","voice/chase2.mp3"],
    hurt:["voice/hurt1.mp3","voice/hurt2.mp3","voice/hurt3.mp3"],
    angry:["voice/angry1.mp3","voice/angry2.mp3"],
    furious:["voice/furious1.mp3","voice/furious2.mp3"],
    scared:["voice/scared1.mp3","voice/scared2.mp3"],
    attack:["voice/attack1.mp3","voice/attack2.mp3"],
    block:["voice/block1.mp3"],
    death:["voice/death1.mp3","voice/death2.mp3"]
  };

  let npcVoiceAudio=null;
  let failedVoiceFiles=new Set();

  function tryPlayHumanVoice(kind){
    if(!HUMAN_VOICE_FILES_AVAILABLE) return false;
    const list=NPC_VOICE_CLIPS[kind];
    if(!list?.length) return false;

    const available=list.filter(x=>!failedVoiceFiles.has(x));
    if(!available.length) return false;

    const src=available[Math.floor(Math.random()*available.length)];

    try{
      if(npcVoiceAudio && !npcVoiceAudio.paused) return true;
      const a=new Audio(src);
      a.volume=.90;
      a.preload="auto";
      a.onerror=()=>failedVoiceFiles.add(src);
      a.play().catch(()=>failedVoiceFiles.add(src));
      npcVoiceAudio=a;
      return true;
    }catch(_){
      failedVoiceFiles.add(src);
      return false;
    }
  }

  function npcButtWorldCenter(){
    if(!npc?.root)return null;
    return npcLocalToWorld(new BABYLON.Vector3(0,.72,-.19));
  }

  function slapNpc(zone="butt",side="right",strength=.9){
    if(!npc||npc.dead)return;
    playImpactSound("slap",Math.max(.5,Math.min(1.2,strength)));
    npc.buttJiggle=Math.max(npc.buttJiggle||0,.22+strength*.22);
    npc.slapReactTimer=.7;
    npc.slapReactSide=side==="left"?-1:1;
    npc.emotion=zone==="butt"?"shocked":"hurt";
    npc.emotionBurst=Math.max(npc.emotionBurst||0,1.05);
    npc.stun=Math.max(npc.stun,zone==="butt"?.18:.10);
    if(zone==="butt"){
      npc.slapPrintTimer=15;
      npc.slapFloatTimer=1;
      npc.npcSlapPrint?.setEnabled?.(true);
      npc.npcFloatHand?.setEnabled?.(true);
    }
  }

  function trySlapNpc(side,pos,speed,applyNow=true){
    if(gameMode!=="map"||!npc||npc.dead||speed<1.05)return false;
    const butt=npcButtWorldCenter();
    if(butt&&BABYLON.Vector3.Distance(pos,butt)<.23){
      if(applyNow)slapNpc("butt",side,Math.min(1.15,.45+speed*.12));
      return "butt";
    }
    const body=npcLocalToWorld(new BABYLON.Vector3(0,1.05,0));
    if(BABYLON.Vector3.Distance(pos,body)<.30){
      if(applyNow)slapNpc("body",side,Math.min(1.0,.40+speed*.10));
      return "body";
    }
    return false;
  }

  function updateNpcSlap(dt){
    if(!npc)return;
    npc.buttJiggle=(npc.buttJiggle||0)*Math.pow(.08,dt);
    npc.slapReactTimer=Math.max(0,(npc.slapReactTimer||0)-dt);
    if(npc.slapReactTimer>0){
      npc.visual.rotation.z=Math.sin((.7-npc.slapReactTimer)*15)*.055*(npc.slapReactSide||1);
    }else{
      npc.visual.rotation.z*=Math.pow(.02,dt);
    }
    npc.slapPrintTimer=Math.max(0,(npc.slapPrintTimer||0)-dt);
    npc.slapFloatTimer=Math.max(0,(npc.slapFloatTimer||0)-dt);
    const j=npc.buttJiggle||0;
    if(npc.npcButtL&&npc.npcButtR){
      npc.npcButtL.scaling.set(1,1+.10*j,1.18+.16*j);
      npc.npcButtR.scaling.set(1,1+.10*j,1.18+.16*j);
    }
    if(npc.npcSlapPrint)npc.npcSlapPrint.setEnabled(npc.slapPrintTimer>0&&!npc.dead);
    if(npc.npcFloatHand){
      npc.npcFloatHand.setEnabled(npc.slapFloatTimer>0&&!npc.dead);
      if(npc.slapFloatTimer>0){
        const k=1-npc.slapFloatTimer;
        npc.npcFloatHand.position.y=.88+k*.32;
      }else npc.npcFloatHand.position.y=.88;
    }
  }

  function reactNpc(kind,intensity=1){
    if(!npc||npc.dead)return;
    const lowHp=npc.hpValue<npc.maxHp*.25;
    if(kind==="near"){
      npc.emotion=Math.random()<.5?"shocked":"scared";
      npc.emotionBurst=.55+.35*intensity;
    }else if(kind==="block"){
      npc.emotion=Math.random()<.55?"shocked":"angry";
      npc.emotionBurst=.55+.25*intensity;
    }else if(kind==="weaponBreak"){
      npc.emotion="scared";npc.emotionBurst=1.4;
    }else if(kind==="heavyHit"){
      npc.emotion=lowHp?"scared":"hurt";npc.emotionBurst=.8+.4*intensity;
    }else if(kind==="lowHp"||lowHp){
      npc.emotion="scared";npc.emotionBurst=Math.max(npc.emotionBurst||0,1.0);
    }
  }

  function speakNpc(kind,force=false) {
    if(!npc || npc.dead)return;

    // Crazy Office NPCs do not speak words.
    // These calls only drive facial emotion and are ready for real scream clips later.
    const emotionByKind={
      hurt:"hurt", angry:"angry", furious:"angry", scared:"scared",
      attack:"angry", block:"shocked", death:"scared", chase:"shocked"
    };
    npc.emotion=emotionByKind[kind]||npc.archetype?.preferredEmotion||"normal";
    npc.emotionBurst=kind==="death"?2.0:kind==="scared"?1.35:kind==="hurt"?.72:1.0;
    npc.screamKind=kind;

    const chance=force?1:{
      chase:.10,angry:.18,furious:.26,hurt:.38,scared:.28,attack:.12,block:.20,death:1
    }[kind]||.12;

    if(Math.random()<=chance){
      tryPlayHumanVoice(kind); // silent until recorded files are added later
    }
    npc.reactionCooldown=kind==="death"?0:2.2+Math.random()*2.8;
  }

  // ------------------------------------------------------------
  // NPC
  // ------------------------------------------------------------
  let npc=null;
  const NPC_RADIUS=.30;
  const NPC_HEIGHT=1.86;
  const NPC_GRAVITY=-6.4;

  function speechBubble(root) {
    const p=new BABYLON.TransformNode("npcSilentReaction",scene);
    p.parent=root;
    p.setEnabled(false);
    return {plane:p,text:{text:""}};
  }

  function hpLabel(root) {
    const p=BABYLON.MeshBuilder.CreatePlane("npcHP",{width:1.12,height:.24},scene);
    p.parent=root;
    p.position.y=2.15;
    p.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;

    const t=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(p,760,165);

    const frame=new BABYLON.GUI.Rectangle();
    frame.width="100%";
    frame.height="100%";
    frame.background="#09110dEE";
    frame.color="#d9ffe5";
    frame.thickness=5;
    frame.cornerRadius=24;
    t.addControl(frame);

    const inner=new BABYLON.GUI.Rectangle();
    inner.width="94%";
    inner.height="62%";
    inner.background="#162019";
    inner.color="transparent";
    inner.thickness=0;
    inner.cornerRadius=17;
    frame.addControl(inner);

    const bar=new BABYLON.GUI.Rectangle();
    bar.horizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bar.verticalAlignment=BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    bar.width="100%";
    bar.height="100%";
    bar.background="#22c55e";
    bar.color="transparent";
    bar.thickness=0;
    bar.cornerRadius=16;
    inner.addControl(bar);

    const tx=new BABYLON.GUI.TextBlock();
    tx.text="160 / 160 HP";
    tx.color="white";
    tx.fontSize=50;
    tx.fontWeight="900";
    tx.outlineColor="#08130d";
    tx.outlineWidth=5;
    frame.addControl(tx);

    return {
      plane:p,
      text:tx,
      bar,
      frame,
      flashTimer:0
    };
  }

  const NPC_WEAPONS=[
    {name:"Pipe",damage:18,knockback:2.7,reach:.86},
    {name:"Hammer",damage:23,knockback:3.2,reach:.74},
    {name:"Frying Pan",damage:17,knockback:2.5,reach:.76},
    {name:"Broom",damage:15,knockback:2.3,reach:.98}
  ];

  const NPC_ARCHETYPES=[
    {
      name:"Worker",
      maxHp:160,
      speed:1.30,
      attackMul:1.00,
      knockbackMul:1.00,
      attackRate:.38,
      throwRate:1.0,
      preferredEmotion:"normal"
    },
    {
      name:"Runner",
      maxHp:128,
      speed:1.78,
      attackMul:.85,
      knockbackMul:.88,
      attackRate:.33,
      throwRate:.7,
      preferredEmotion:"scared"
    },
    {
      name:"Tank",
      maxHp:235,
      speed:.96,
      attackMul:1.14,
      knockbackMul:1.08,
      attackRate:.52,
      throwRate:1.15,
      preferredEmotion:"angry"
    },
    {
      name:"Bruiser",
      maxHp:190,
      speed:1.42,
      attackMul:1.26,
      knockbackMul:1.22,
      attackRate:.42,
      throwRate:1.25,
      preferredEmotion:"angry"
    },
    {
      name:"Guard",
      maxHp:205,
      speed:1.18,
      attackMul:1.18,
      knockbackMul:1.12,
      attackRate:.40,
      throwRate:.85,
      preferredEmotion:"angry"
    },
    {
      name:"Manager",
      maxHp:145,
      speed:1.24,
      attackMul:.92,
      knockbackMul:.92,
      attackRate:.46,
      throwRate:1.35,
      preferredEmotion:"normal"
    },
    {
      name:"Heavy Guard",
      maxHp:255,
      speed:.88,
      attackMul:1.35,
      knockbackMul:1.28,
      attackRate:.58,
      throwRate:.80,
      preferredEmotion:"angry"
    },
    {
      name:"Fast Worker",
      maxHp:112,
      speed:1.95,
      attackMul:.78,
      knockbackMul:.82,
      attackRate:.30,
      throwRate:.65,
      preferredEmotion:"normal"
    }
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

    const base=new BABYLON.TransformNode("npcWeaponBase",scene);
    base.parent=root;
    base.position.z=.055;

    const mid=new BABYLON.TransformNode("npcWeaponMid",scene);
    mid.parent=root;
    mid.position.z=cfg.reach*.50;

    const tip=new BABYLON.TransformNode("npcWeaponTip",scene);
    tip.parent=root;
    tip.position.z=cfg.reach;

    return {root,base,mid,tip,cfg};
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

  function npcWorldToLocalPoint(v){
    return rotY(v.subtract(npc.root.position),-npc.root.rotation.y);
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
      pelvis:ragPoint("pelvis",0,.67,0,.17,.50),
      spineLow:ragPoint("spineLow",0,.91,0,.145,.48),
      chest:ragPoint("chest",0,1.22,0,.19,.44),
      neckBase:ragPoint("neckBase",0,1.43,0,.09,.62),
      head:ragPoint("head",0,1.67,0,.21,.76),

      lShoulder:ragPoint("lShoulder",-.32,1.31,0,.105,.78),
      lElbow:ragPoint("lElbow",-.46,1.04,.055,.092,.90),
      lWrist:ragPoint("lWrist",-.40,.84,.105,.072,.98),
      lHand:ragPoint("lHand",-.37,.75,.125,.095,1),

      rShoulder:ragPoint("rShoulder",.32,1.31,0,.105,.78),
      rElbow:ragPoint("rElbow",.46,1.04,.055,.092,.90),
      rWrist:ragPoint("rWrist",.40,.84,.105,.072,.98),
      rHand:ragPoint("rHand",.37,.75,.125,.095,1),

      lHip:ragPoint("lHip",-.15,.64,0,.115,.70),
      lKnee:ragPoint("lKnee",-.15,.36,.02,.105,.88),
      lAnkle:ragPoint("lAnkle",-.15,.13,.055,.082,.98),
      lFoot:ragPoint("lFoot",-.15,.07,.23,.105,1),

      rHip:ragPoint("rHip",.15,.64,0,.115,.70),
      rKnee:ragPoint("rKnee",.15,.36,.02,.105,.88),
      rAnkle:ragPoint("rAnkle",.15,.13,.055,.082,.98),
      rFoot:ragPoint("rFoot",.15,.07,.23,.105,1)
    };

    const constraints=[
      // Spine + real neck chain.
      ragConstraint(p.pelvis,p.spineLow,1),
      ragConstraint(p.spineLow,p.chest,1),
      ragConstraint(p.chest,p.neckBase,.995),
      ragConstraint(p.neckBase,p.head,.985),

      // Arms with wrists.
      ragConstraint(p.chest,p.lShoulder,.99),
      ragConstraint(p.lShoulder,p.lElbow,.995),
      ragConstraint(p.lElbow,p.lWrist,.995),
      ragConstraint(p.lWrist,p.lHand,.995),

      ragConstraint(p.chest,p.rShoulder,.99),
      ragConstraint(p.rShoulder,p.rElbow,.995),
      ragConstraint(p.rElbow,p.rWrist,.995),
      ragConstraint(p.rWrist,p.rHand,.995),

      // Legs with ankles.
      ragConstraint(p.pelvis,p.lHip,.99),
      ragConstraint(p.lHip,p.lKnee,.995),
      ragConstraint(p.lKnee,p.lAnkle,.997),
      ragConstraint(p.lAnkle,p.lFoot,.985),

      ragConstraint(p.pelvis,p.rHip,.99),
      ragConstraint(p.rHip,p.rKnee,.995),
      ragConstraint(p.rKnee,p.rAnkle,.997),
      ragConstraint(p.rAnkle,p.rFoot,.985),

      // Shoulder/hip width.
      ragConstraint(p.lShoulder,p.rShoulder,.975),
      ragConstraint(p.lHip,p.rHip,.985),

      // Neck and shoulder braces prevent the head from detaching visually.
      ragConstraint(p.neckBase,p.lShoulder,.94),
      ragConstraint(p.neckBase,p.rShoulder,.94),
      ragConstraint(p.head,p.lShoulder,.72),
      ragConstraint(p.head,p.rShoulder,.72),

      // Torso braces: flexible but connected.
      ragConstraint(p.lShoulder,p.lHip,.87),
      ragConstraint(p.rShoulder,p.rHip,.87),
      ragConstraint(p.lShoulder,p.rHip,.82),
      ragConstraint(p.rShoulder,p.lHip,.82),
      ragConstraint(p.spineLow,p.lShoulder,.86),
      ragConstraint(p.spineLow,p.rShoulder,.86),
      ragConstraint(p.chest,p.lHip,.86),
      ragConstraint(p.chest,p.rHip,.86),

      // Knee/ankle stabilizers keep knees from folding inside out too easily.
      ragConstraint(p.lHip,p.lAnkle,.73),
      ragConstraint(p.rHip,p.rAnkle,.73)
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

  function setRotationAlong(mesh,a,b){
    const d=b.subtract(a);
    if(d.lengthSquared()<.000001) return;
    const dir=d.normalize();
    const up=new BABYLON.Vector3(0,1,0);
    let axis=BABYLON.Vector3.Cross(up,dir);
    const dot=BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(up,dir),-1,1);
    const angle=Math.acos(dot);

    if(axis.lengthSquared()<.000001){
      mesh.rotationQuaternion=dot<0
        ? BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1,0,0),Math.PI)
        : BABYLON.Quaternion.Identity();
    }else{
      axis.normalize();
      mesh.rotationQuaternion=BABYLON.Quaternion.RotationAxis(axis,angle);
    }
  }

  function npcUprightMetrics(){
    if(!npc?.ragdoll) return {
      upright:1,
      chestOffset:0,
      headOffset:0,
      rootTilt:0,
      headY:2,
      chestY:1.3,
      pelvisY:.7
    };

    const p=npc.ragdoll.points;

    const spine=p.chest.pos.subtract(p.pelvis.pos);
    let upright=1;
    if(spine.lengthSquared()>.000001){
      upright=Math.abs(spine.normalize().y);
    }

    const chestDx=p.chest.pos.x-p.pelvis.pos.x;
    const chestDz=p.chest.pos.z-p.pelvis.pos.z;
    const headDx=p.head.pos.x-p.pelvis.pos.x;
    const headDz=p.head.pos.z-p.pelvis.pos.z;

    return {
      upright,
      chestOffset:Math.hypot(chestDx,chestDz),
      headOffset:Math.hypot(headDx,headDz),
      rootTilt:Math.max(
        Math.abs(npc.root.rotation.x),
        Math.abs(npc.root.rotation.z)
      ),
      headY:p.head.pos.y,
      chestY:p.chest.pos.y,
      pelvisY:p.pelvis.pos.y
    };
  }

  function npcIsDown(){
    const m=npcUprightMetrics();

    // This is deliberately strict. A half-upright NPC is still "down".
    return (
      m.headY<1.43 ||
      m.chestY<1.05 ||
      m.pelvisY<.52 ||
      m.upright<.86 ||
      m.chestOffset>.17 ||
      m.headOffset>.24 ||
      m.rootTilt>.14
    );
  }

  function npcIsFullyUpright(){
    const m=npcUprightMetrics();

    return (
      m.headY>1.54 &&
      m.chestY>1.13 &&
      m.pelvisY>.58 &&
      m.upright>.955 &&
      m.chestOffset<.085 &&
      m.headOffset<.13 &&
      m.rootTilt<.045
    );
  }

  function startNpcRecovery(){
    if(!npc || npc.dead || npc.recovering) return;
    npc.recovering=true;
    npc.recoverTimer=1.45;
    npc.recoverStableTimer=0;
    npc.attackAnim=0;
    npc.attackCooldown=Math.max(npc.attackCooldown,.8);
    npc.velocity.x*=.25;
    npc.velocity.z*=.25;
    npc.angular.scaleInPlace(.20);
  }

  function ragTarget(name){
    const rd=npc.ragdoll;
    const base=rd.points[name].base.clone();

    if(npc.dead){
      if(npc.deathPhase==="stagger"){
        const t=BABYLON.Scalar.Clamp(1-npc.deathTimer/.48,0,1);
        const side=BABYLON.Scalar.Clamp(npc.angular.y*.08,-.18,.18);

        if(name==="chest"){
          base.x+=side*t;
          base.y-=.06*t;
          base.z-=.08*t;
        }else if(name==="spineLow"){
          base.x+=side*.60*t;
          base.y-=.035*t;
        }else if(name==="head"){
          base.x+=side*1.25*t;
          base.y-=.055*t;
          base.z-=.055*t;
        }else if(name==="lKnee"){
          base.y-=.06*t;
          base.z+=.05*t;
        }else if(name==="rKnee"){
          base.y-=.085*t;
          base.z-=.04*t;
        }else if(name==="lHand" || name==="rHand"){
          base.y-=.10*t;
        }
        return base;
      }
      return base;
    }

    if(npc.recovering){
      const t=BABYLON.Scalar.Clamp(1-npc.recoverTimer/1.45,0,1);

      // Pull the ragdoll into a crouched get-up pose first,
      // then back to normal standing targets.
      if(name==="pelvis"){
        base.x=0;
        base.z=0;
        base.y=.50+.17*t;
      }else if(name==="spineLow"){
        base.x=0;
        base.z=0;
        base.y=.74+.17*t;
      }else if(name==="chest"){
        base.x=0;
        base.z=0;
        base.y=1.01+.21*t;
      }else if(name==="neckBase"){
        base.x=0;
        base.z=0;
        base.y=1.23+.20*t;
      }else if(name==="head"){
        base.x=0;
        base.z=0;
        base.y=1.44+.23*t;
      }else if(name==="lKnee"){
        base.x=-.15;
        base.y=.27+.09*t;
        base.z=.10*(1-t);
      }else if(name==="rKnee"){
        base.x=.15;
        base.y=.27+.09*t;
        base.z=.10*(1-t);
      }else if(name==="lFoot"){
        base.x=-.15;
        base.y=.07;
        base.z=.20;
      }else if(name==="rFoot"){
        base.x=.15;
        base.y=.07;
        base.z=.20;
      }else if(name==="lHand"){
        base.x=-.37;
        base.y=.58+.17*t;
        base.z=.12*(1-t);
      }else if(name==="rHand"){
        base.x=.37;
        base.y=.58+.17*t;
        base.z=.12*(1-t);
      }
      return base;
    }

    const walking=npc.walkingNow ? 1 : 0;
    const phase=npc.walkPhase;
    const stride=Math.sin(phase)*.155*walking;
    const lift=Math.max(0,Math.sin(phase))*.052*walking;
    const liftOpp=Math.max(0,-Math.sin(phase))*.052*walking;

    // Tiny breathing/sway prevents the NPC from looking completely frozen.
    const breathe=Math.sin(performance.now()*.0026)*.008;
    if(name==="chest") base.y+=breathe;
    if(name==="neckBase") base.y+=breathe*.65;
    if(name==="head") {
      base.y+=breathe*.45;
      base.x+=Math.sin(performance.now()*.0017)*.006;
    }

    if(name==="lFoot"){
      base.z+=stride; base.y+=lift;
    }else if(name==="rFoot"){
      base.z-=stride; base.y+=liftOpp;
    }else if(name==="lAnkle"){
      base.z+=stride*.78; base.y+=lift*.70;
    }else if(name==="rAnkle"){
      base.z-=stride*.78; base.y+=liftOpp*.70;
    }else if(name==="lKnee"){
      base.z+=stride*.48; base.y+=lift*.48;
    }else if(name==="rKnee"){
      base.z-=stride*.48; base.y+=liftOpp*.48;
    }else if(name==="lHand"){
      base.z-=stride*.52;
    }else if(name==="rHand"){
      base.z+=stride*.52;
    }else if(name==="lWrist"){
      base.z-=stride*.44;
    }else if(name==="rWrist"){
      base.z+=stride*.44;
    }else if(name==="lElbow"){
      base.z-=stride*.27;
    }else if(name==="rElbow"){
      base.z+=stride*.27;
    }

    // Right arm actively reaches toward the player's current body.
    if(npc.attackAnim>0 && isInXR()){
      const progress=1-(npc.attackAnim/npc.attackDuration);
      const shoulder=rd.points.rShoulder.base.clone();

      const combatTarget=npcCombatTarget();
      const spheres=combatTargetSpheres(combatTarget);
      const targetWorld=(spheres[1]?.center || spheres[0]?.center || playerWorldPos()).clone();
      const target=npcWorldToLocalPoint(targetWorld);

      let reach=target.subtract(shoulder);
      if(reach.lengthSquared()<.001) reach.set(0,0,.72);
      reach.normalize().scaleInPlace(.72);

      const strike=shoulder.add(reach);
      const windup=shoulder.add(new BABYLON.Vector3(.20,.22,-.30));

      let handTarget;
      if(progress<.27){
        handTarget=BABYLON.Vector3.Lerp(
          rd.points.rHand.base,
          windup,
          progress/.27
        );
      }else{
        const t=(progress-.27)/.73;
        const smooth=t*t*(3-2*t);
        handTarget=BABYLON.Vector3.Lerp(windup,strike,smooth);
      }

      if(name==="rHand") return handTarget;

      if(name==="rWrist"){
        return BABYLON.Vector3.Lerp(shoulder,handTarget,.80)
          .add(new BABYLON.Vector3(.025,.015,0));
      }

      if(name==="rElbow"){
        const elbow=BABYLON.Vector3.Lerp(shoulder,handTarget,.50);
        elbow.y+=.085;
        elbow.x+=.055;
        return elbow;
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

  function collideNpcRagdollPoint(p,dt){
    const world=npcLocalToWorld(p.pos);
    const hit=findSurfaceCollision(world,p.radius);
    if(!hit) return;

    const localVel=p.pos.subtract(p.prev).scale(1/Math.max(dt,.008));
    const worldVel=rotY(localVel,npc.root.rotation.y);
    const speed=worldVel.length();

    if(hit.mesh?.metadata?.breakableWindow && speed>2.15){
      if(breakWindow(hit.mesh,world,worldVel)){
        // Do not push the body back after the glass has broken.
        return;
      }
    }

    const localCorrection=worldVectorToNpcLocal(hit.correction);
    p.pos.addInPlace(localCorrection);

    // Collision damping keeps the ragdoll from becoming a trampoline.
    p.prev.addInPlace(localCorrection.scale(.68));
  }

  function updateNpcRagdoll(dt,active){
    if(!npc?.ragdoll) return;

    const rd=npc.ragdoll;
    const frame=Math.min(1.4,dt*60);
    const gravity=active ? -5.4 : -7.1;
    const damping=active ? .865 : .930;

    let strength=.155;
    if(npc.dead && npc.deathPhase==="stagger") strength=.038;
    else if(npc.recovering) strength=.46;
    else if(npc.stun>0) strength=.010;
    else if(npc.recentlyHit>0) strength=.024;
    else if(npc.emotion==="angry") strength=.185;
    else if(npc.emotion==="scared") strength=.125;

    for(const p of rd.list){
      const vel=p.pos.subtract(p.prev).scale(damping);

      // Clamp individual point speed to stop solver explosions.
      const maxStep=active ? .078 : .100;
      if(vel.length()>maxStep){
        vel.normalize().scaleInPlace(maxStep);
      }

      p.prev.copyFrom(p.pos);
      p.pos.addInPlace(vel);
      p.pos.y+=gravity*dt*dt;

      if(active){
        const target=ragTarget(p.name);
        const localStrength=
          (p.name==="pelvis" || p.name==="spineLow" || p.name==="chest")
            ? strength*1.34 :
          p.name==="neckBase" ? strength*1.18 :
          p.name==="head" ? strength*1.08 :
          strength;

        p.pos.addInPlace(
          target.subtract(p.pos).scale(localStrength*frame)
        );
      }
    }

    // Stable Quest setting: enough constraints without over-solving/jitter.
    for(let iteration=0;iteration<8;iteration++){
      for(const c of rd.constraints) solveRagConstraint(c);
      for(const p of rd.list) collideNpcRagdollPoint(p,dt);
    }

    updateNpcRagdollMeshes();

  }

  function updateNpcFace(dt){
    if(!npc) return;
    if(npc.dead && npc.deathPhase!=="stagger" && npc.deathPhase!=="collapse")return;

    npc.emotionBurst=Math.max(0,(npc.emotionBurst||0)-dt);
    if(npc.emotionBurst<=0 && npc.hpValue>0 && !(net.connected&&!net.isHost)){
      if(npc.hpValue<npc.maxHp*.22)reactNpc("lowHp",1);else npc.emotion=npc.archetype?.preferredEmotion||"normal";
    }

    npc.faceBlink-=dt;
    if(npc.faceBlink<=0){
      npc.faceBlink=1.8+Math.random()*3.2;
      npc.faceBlinkAmount=1;
    }
    npc.faceBlinkAmount=Math.max(0,npc.faceBlinkAmount-dt*12);

    const faceTarget=npcFaceTarget();
    const target=(faceTarget?.pos||(net.connected&&!net.isHost?npc.root.position.add(new BABYLON.Vector3(0,1.55,1)):playerWorldPos())).clone();
    const headWorld=npcLocalToWorld(npc.ragdoll.points.head.pos);
    const local=worldVectorToNpcLocal(target.subtract(headWorld));
    const px=BABYLON.Scalar.Clamp(local.x*.030,-.025,.025);
    const py=BABYLON.Scalar.Clamp(local.y*.016,-.017,.017);
    npc.leftPupil.position.y=.070+py;npc.rightPupil.position.y=.070+py;

    const style=npc.faceStyle||0;
    const eyeSpread=[1,.92,1.10,1.04][style]||1;
    const eyeBase=.085*eyeSpread;
    npc.leftEyeWhite.position.x=-eyeBase;
    npc.rightEyeWhite.position.x=eyeBase;
    npc.leftEye.position.x=-eyeBase;
    npc.rightEye.position.x=eyeBase;
    npc.leftPupil.position.x=-eyeBase+px;
    npc.rightPupil.position.x=eyeBase+px;
    if(npc.hair){
      const hs=[1,.90,1.08,.96][npc.outfitStyle||0]||1;
      npc.hair.scaling.x=hs;
      npc.hair.rotation.z=[0,.08,-.08,.14][npc.outfitStyle||0]||0;
    }

    const blinking=npc.faceBlinkAmount>0;
    let eyeY=blinking?.12:1.02;
    let eyeX=1.03;
    let mouthX=1,mouthY=1;
    let browL=-.08,browR=.08;

    if(npc.emotion==="angry"){
      eyeY=blinking?.12:.82;eyeX=1.08;
      browL=-.42;browR=.42;
      mouthX=1.22;mouthY=1.65;
    }else if(npc.emotion==="scared"){
      eyeY=blinking?.12:1.24;eyeX=1.14;
      browL=.22;browR=-.22;
      mouthX=.82;mouthY=3.65;
    }else if(npc.emotion==="shocked"){
      eyeY=blinking?.12:1.32;eyeX=1.18;
      browL=.10;browR=-.10;
      mouthX=.92;mouthY=3.95;
    }else if(npc.emotion==="hurt"){
      eyeY=blinking?.10:.58;eyeX=.95;
      browL=-.18;browR=.30;
      mouthX=1.10;mouthY=2.25;
    }

    npc.leftEyeWhite.scaling.x=eyeX;
    npc.rightEyeWhite.scaling.x=eyeX;
    npc.leftEyeWhite.scaling.y=eyeY;
    npc.rightEyeWhite.scaling.y=eyeY;
    npc.leftEye.scaling.y=blinking?.15:1;
    npc.rightEye.scaling.y=blinking?.15:1;
    npc.leftPupil.scaling.y=blinking?.12:1;
    npc.rightPupil.scaling.y=blinking?.12:1;

    npc.eyebrowL.rotation.z=browL;
    npc.eyebrowR.rotation.z=browR;
    npc.mouth.scaling.x=mouthX;
    npc.mouth.scaling.y=mouthY;
    npc.teeth.setEnabled(npc.emotion==="scared"||npc.emotion==="shocked"||npc.emotion==="angry");
  }

  function tubeRadiusFunction(radii){
    return (i)=>{
      if(!radii?.length) return .1;
      return radii[Math.min(i,radii.length-1)];
    };
  }

  function createSmoothNpcTube(name,path,radii,material,parent){
    const mesh=BABYLON.MeshBuilder.CreateTube(name,{
      path,
      radiusFunction:tubeRadiusFunction(radii),
      tessellation:20,
      cap:BABYLON.Mesh.NO_CAP,
      updatable:true
    },scene);
    mesh.parent=parent;
    mesh.material=material;
    return mesh;
  }

  function updateSmoothNpcTube(mesh,path,radii){
    BABYLON.MeshBuilder.CreateTube(null,{
      path,
      radiusFunction:tubeRadiusFunction(radii),
      instance:mesh
    },scene);
  }

  function updateNpcRagdollMeshes(){
    if(!npc?.ragdoll) return;
    const p=npc.ragdoll.points;

    // The actual physics skeleton is still made of points/joints,
    // but the player now sees continuous smooth body surfaces.
    updateSmoothNpcTube(
      npc.bodyShell,
      [
        p.pelvis.pos,
        p.spineLow.pos,
        p.chest.pos.add(p.neckBase.pos.subtract(p.chest.pos).scale(.44)),
        p.neckBase.pos.add(new BABYLON.Vector3(0,-.07,0))
      ],
      [.175,.195,.225,.240]
    );

    // Broad connected shoulders cover the torso cap and join both arms.
    setSegment(npc.shoulderBridge,p.lShoulder.pos,p.rShoulder.pos,1);

    updateSmoothNpcTube(
      npc.leftSleeveShell,
      [
        p.chest.pos.add(p.lShoulder.pos.subtract(p.chest.pos).scale(.62)),
        p.lShoulder.pos,
        BABYLON.Vector3.Lerp(p.lShoulder.pos,p.lElbow.pos,.30)
      ],
      [.150,.140,.112]
    );

    updateSmoothNpcTube(
      npc.rightSleeveShell,
      [
        p.chest.pos.add(p.rShoulder.pos.subtract(p.chest.pos).scale(.62)),
        p.rShoulder.pos,
        BABYLON.Vector3.Lerp(p.rShoulder.pos,p.rElbow.pos,.30)
      ],
      [.150,.140,.112]
    );

    updateSmoothNpcTube(
      npc.leftArmShell,
      [
        BABYLON.Vector3.Lerp(p.lShoulder.pos,p.lElbow.pos,.27),
        p.lElbow.pos,p.lWrist.pos,p.lHand.pos
      ],
      [.096,.090,.075,.063]
    );
    updateSmoothNpcTube(
      npc.rightArmShell,
      [
        BABYLON.Vector3.Lerp(p.rShoulder.pos,p.rElbow.pos,.27),
        p.rElbow.pos,p.rWrist.pos,p.rHand.pos
      ],
      [.096,.090,.075,.063]
    );

    updateSmoothNpcTube(
      npc.leftLegShell,
      [p.lHip.pos,p.lKnee.pos,p.lAnkle.pos],
      [.118,.108,.091]
    );
    updateSmoothNpcTube(
      npc.rightLegShell,
      [p.rHip.pos,p.rKnee.pos,p.rAnkle.pos],
      [.118,.108,.091]
    );

    // Smooth neck with no visible capsule caps/rings.
    const neckBottom=BABYLON.Vector3.Lerp(p.chest.pos,p.neckBase.pos,.52);
    const neckMid=p.neckBase.pos;
    const neckTop=BABYLON.Vector3.Lerp(p.neckBase.pos,p.head.pos,.72);
    updateSmoothNpcTube(
      npc.neckShell,
      [neckBottom,neckMid,neckTop],
      [.092,.087,.082]
    );

    npc.pelvis.position.copyFrom(p.pelvis.pos);
    npc.head.position.copyFrom(p.head.pos);
    setRotationAlong(npc.head,p.neckBase.pos,p.head.pos);

    // Legacy sleeve spheres are hidden; smooth sleeve tubes do the blending.

    // Hands overlap the end of the tube so there is no wrist gap.
    npc.leftHand.position.copyFrom(p.lHand.pos);
    npc.rightHand.position.copyFrom(p.rHand.pos);
    npc.leftHand.rotationQuaternion=
      BABYLON.Quaternion.Identity();
    npc.rightHand.rotationQuaternion=
      BABYLON.Quaternion.Identity();

    // Shoes overlap the leg tubes at the ankles.
    setSegment(npc.leftShoe,p.lAnkle.pos,p.lFoot.pos,.31);
    setSegment(npc.rightShoe,p.rAnkle.pos,p.rFoot.pos,.31);

    // Clothing transition details.
    npc.belt.position.copyFrom(p.pelvis.pos.add(p.spineLow.pos).scale(.5));
    setRotationAlong(npc.belt,p.pelvis.pos,p.spineLow.pos);

    npc.collar.position.copyFrom(p.neckBase.pos);
    setRotationAlong(npc.collar,p.chest.pos,p.neckBase.pos);

    // Weapon follows the physical right hand.
    npc.weaponRoot.position.copyFrom(p.rHand.pos);
    npc.weaponRoot.rotationQuaternion=
      npc.rightHand.rotationQuaternion?.clone() ||
      BABYLON.Quaternion.Identity();
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
        impulseLocal.scale(.026*falloff*massScale)
      );
    }
  }

  const deathParts=[];

  function createNpc() {
    // v0.23 no longer uses detached death pieces.
    while(deathParts.length){
      const old=deathParts.pop();
      old?.mesh?.dispose?.();
    }

    const root=new BABYLON.TransformNode("npcRoot",scene);
    root.position=new BABYLON.Vector3(0,0,1.8);

    const visual=new BABYLON.TransformNode("npcVisual",scene);
    visual.parent=root;

    const npcPalettes=[
      {skin:"#e1a77e",skinDark:"#bb7658",shirt:"#3f86d8",shirtDark:"#285a94"},
      {skin:"#f0bb91",skinDark:"#ca8464",shirt:"#8b61d4",shirtDark:"#5d3f96"},
      {skin:"#c98a69",skinDark:"#9b5e48",shirt:"#4fae78",shirtDark:"#32704e"},
      {skin:"#efc39f",skinDark:"#c88b68",shirt:"#e27c43",shirtDark:"#a44d25"},
      {skin:"#d9a37f",skinDark:"#ad7054",shirt:"#d65587",shirtDark:"#91375c"}
    ];
    const look=npcPalettes[Math.floor(Math.random()*npcPalettes.length)];
    const archetype=NPC_ARCHETYPES[Math.floor(Math.random()*NPC_ARCHETYPES.length)];

    const skinMat=mkMat("npcSkin"+Math.random(),look.skin);
    const skinDarkMat=mkMat("npcSkinDark"+Math.random(),look.skinDark);
    const shirtMat=mkMat("npcShirt"+Math.random(),look.shirt);
    const shirtDarkMat=mkMat("npcShirtDark"+Math.random(),look.shirtDark);
    const pantsMat=mkMat("npcPants"+Math.random(),"#334155");
    const pantsDarkMat=mkMat("npcPantsDark"+Math.random(),"#202a38");
    const shoeMat=mkMat("npcShoes"+Math.random(),"#111827");
    const soleMat=mkMat("npcSoles"+Math.random(),"#080b10");
    const eyeWhiteMat=mkMat("npcEyeWhite"+Math.random(),"#f5f6f4");
    const eyeMat=mkMat("npcEyes"+Math.random(),"#2a211b");
    const pupilMat=mkMat("npcPupil"+Math.random(),"#090909");
    const hairColors=["#2e7fd6","#da4d97","#eb773c","#36a88a","#6e4ec4","#3b2b22","#f0c93d","#65c9ff","#ff5f63"];
    const hairBase=hairColors[Math.floor(Math.random()*hairColors.length)];
    const hairMat=mkMat("npcHair"+Math.random(),hairBase);
    const beardMat=mkMat("npcBeard"+Math.random(),"#4b3429");
    beardMat.alpha=.48;
    // v0.23.7 smoother NPC beard: no noisy diffuse texture;
    const teethMat=mkMat("npcTeeth"+Math.random(),"#f4eee5");

    skinMat.emissiveColor=skinMat.diffuseColor.scale(.055);
    skinDarkMat.emissiveColor=skinDarkMat.diffuseColor.scale(.045);
    shirtMat.emissiveColor=shirtMat.diffuseColor.scale(.025);
    shirtDarkMat.emissiveColor=shirtDarkMat.diffuseColor.scale(.018);
    pantsMat.emissiveColor=pantsMat.diffuseColor.scale(.014);

    // clean v0.23.3: skinMat.diffuseTexture=DETAIL_TEX.skin;
    // clean v0.23.3: skinDarkMat.diffuseTexture=DETAIL_TEX.skin;
    // clean v0.23.3: shirtMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: shirtDarkMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: pantsMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: pantsDarkMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: shoeMat.diffuseTexture=DETAIL_TEX.metal;
    // clean v0.23.3: hairMat.diffuseTexture=DETAIL_TEX.hair;
    // Give the NPC the same clean material style as the office.

    // v0.23.6 clean realism: no dotted skin bump
    // v0.23.6 clean realism: no dotted skinDark bump
    // v0.23.6 clean realism: no dotted shirt bump
    // v0.23.6 clean realism: no dotted shirtDark bump
    // v0.23.6 clean realism: no dotted pants bump
    // v0.23.6 clean realism: no dotted pantsDark bump

    skinMat.specularColor=new BABYLON.Color3(.08,.045,.035);
    skinMat.specularPower=18;
    shirtMat.specularColor=new BABYLON.Color3(.035,.035,.04);
    shirtMat.specularPower=8;

    function capsule(name,radius,material){
      const m=BABYLON.MeshBuilder.CreateCapsule(name,{
        height:1,radius,tessellation:16
      },scene);
      m.parent=visual;
      m.material=material;
      m.rotationQuaternion=BABYLON.Quaternion.Identity();
      return m;
    }

    function jointSphere(name,diameter,material){
      const m=BABYLON.MeshBuilder.CreateSphere(name,{
        diameter,segments:14
      },scene);
      m.parent=visual;
      m.material=material;
      return m;
    }

    // Smooth visible body. The old segmented meshes stay as invisible
    // helpers only; these tubes are what the player actually sees.
    const bodyShell=createSmoothNpcTube(
      "npcSmoothBody",
      [
        new BABYLON.Vector3(0,.66,0),
        new BABYLON.Vector3(0,.90,0),
        new BABYLON.Vector3(0,1.12,0),
        new BABYLON.Vector3(0,1.31,0)
      ],
      [.175,.195,.225,.240],
      shirtMat,
      visual
    );

    // A horizontal shoulder bridge hides the tube cap and joins both arms
    // to the chest like one body.
    const shoulderBridge=capsule("npcShoulderBridge",.135,shirtMat);

    const neckShell=createSmoothNpcTube(
      "npcSmoothNeck",
      [
        new BABYLON.Vector3(0,1.31,0),
        new BABYLON.Vector3(0,1.43,0),
        new BABYLON.Vector3(0,1.54,0)
      ],
      [.090,.088,.084],
      skinMat,
      visual
    );

    const leftSleeveShell=createSmoothNpcTube(
      "npcLeftSleeveTube",
      [
        new BABYLON.Vector3(-.22,1.34,0),
        new BABYLON.Vector3(-.35,1.28,.005),
        new BABYLON.Vector3(-.40,1.20,.01)
      ],
      [.155,.135,.112],
      shirtMat,
      visual
    );

    const rightSleeveShell=createSmoothNpcTube(
      "npcRightSleeveTube",
      [
        new BABYLON.Vector3(.22,1.34,0),
        new BABYLON.Vector3(.35,1.28,.005),
        new BABYLON.Vector3(.40,1.20,.01)
      ],
      [.155,.135,.112],
      shirtMat,
      visual
    );

    const leftArmShell=createSmoothNpcTube(
      "npcSmoothLeftArm",
      [
        new BABYLON.Vector3(-.40,1.20,.01),
        new BABYLON.Vector3(-.48,1.08,.01),
        new BABYLON.Vector3(-.51,.87,.035),
        new BABYLON.Vector3(-.52,.77,.065)
      ],
      [.096,.090,.075,.063],
      skinMat,
      visual
    );

    const rightArmShell=createSmoothNpcTube(
      "npcSmoothRightArm",
      [
        new BABYLON.Vector3(.40,1.20,.01),
        new BABYLON.Vector3(.48,1.08,.01),
        new BABYLON.Vector3(.51,.87,.035),
        new BABYLON.Vector3(.52,.77,.065)
      ],
      [.096,.090,.075,.063],
      skinMat,
      visual
    );

    const leftLegShell=createSmoothNpcTube(
      "npcSmoothLeftLeg",
      [
        new BABYLON.Vector3(-.15,.64,0),
        new BABYLON.Vector3(-.15,.36,.02),
        new BABYLON.Vector3(-.15,.13,.055)
      ],
      [.118,.108,.091],
      pantsMat,
      visual
    );

    const rightLegShell=createSmoothNpcTube(
      "npcSmoothRightLeg",
      [
        new BABYLON.Vector3(.15,.64,0),
        new BABYLON.Vector3(.15,.36,.02),
        new BABYLON.Vector3(.15,.13,.055)
      ],
      [.118,.108,.091],
      pantsMat,
      visual
    );

    // Connected core helper meshes (hidden after creation).
    const abdomen=capsule("npcAbdomen",.225,shirtDarkMat);
    const torso=capsule("npcTorso",.285,shirtMat);
    const neck=capsule("npcNeck",.098,skinMat);
    neck.setEnabled(false);

    const chestPlate=jointSphere("npcChest",.56,shirtMat);
    chestPlate.scaling.set(.88,.55,.60);

    const pelvis=jointSphere("npcPelvis",.44,pantsMat);
    pelvis.scaling.set(1.10,.52,.84);

    ensureAvatarSlapMats();
    const npcButtL=BABYLON.MeshBuilder.CreateSphere("npcButtL"+Math.random(),{diameter:.34,segments:10},scene);
    npcButtL.parent=visual;npcButtL.position.set(-.12,.70,-.19);npcButtL.scaling.set(1,1,1.18);npcButtL.material=pantsMat;
    const npcButtR=npcButtL.clone("npcButtR"+Math.random());npcButtR.parent=visual;npcButtR.position.x=.12;
    const npcSlapPrint=BABYLON.MeshBuilder.CreatePlane("npcSlapPrint"+Math.random(),{width:.24,height:.24},scene);
    npcSlapPrint.parent=visual;npcSlapPrint.position.set(0,.72,-.39);npcSlapPrint.rotation.y=Math.PI;npcSlapPrint.material=avatarHandprintMat;npcSlapPrint.setEnabled(false);
    const npcFloatHand=BABYLON.MeshBuilder.CreatePlane("npcFloatHand"+Math.random(),{width:.30,height:.30},scene);
    npcFloatHand.parent=visual;npcFloatHand.position.set(0,.88,-.30);npcFloatHand.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;npcFloatHand.material=avatarFloatHandMat;npcFloatHand.setEnabled(false);

    const spineJoint=jointSphere("npcSpineJoint",.31,shirtDarkMat);
    spineJoint.scaling.set(1,.72,.80);

    const neckJoint=jointSphere("npcNeckJoint",.17,skinMat);

    // Give skin/clothes softer highlights instead of a toy-like plastic shine.
    skinMat.specularColor=new BABYLON.Color3(.055,.040,.032);
    skinMat.specularPower=10;
    shirtMat.specularColor=new BABYLON.Color3(.025,.028,.032);
    shirtMat.specularPower=7;
    pantsMat.specularColor=new BABYLON.Color3(.04,.05,.07);
    pantsMat.specularPower=10;

    // Head + all face detail parented to the head so it tilts with the neck.
    // One continuous oval head: no separate chin/jaw ball.
    const head=BABYLON.MeshBuilder.CreateCapsule("npcHead",{
      height:.445,
      radius:.205,
      tessellation:18
    },scene);
    head.parent=visual;
    head.material=skinMat;
    head.scaling.set(.98,1,.92);
    head.rotationQuaternion=BABYLON.Quaternion.Identity();

    function faceSphere(name,diam,pos,mat,scale=[1,1,1]){
      const m=BABYLON.MeshBuilder.CreateSphere(name,{diameter:diam,segments:11},scene);
      m.parent=head;
      m.position.set(...pos);
      m.scaling.set(...scale);
      m.material=mat;
      return m;
    }

    const nose=faceSphere("npcNose",.060,[0,-.020,.188],skinMat,[.72,1,.95]);
    const leftEar=faceSphere("npcLeftEar",.090,[-.205,.005,0],skinMat,[.46,1,.42]);
    const rightEar=faceSphere("npcRightEar",.090,[.205,.005,0],skinMat,[.46,1,.42]);

    const leftEyeWhite=faceSphere("npcLeftEyeWhite",.092,[-.085,.070,.212],eyeWhiteMat,[1.03,1.02,.28]);
    const rightEyeWhite=faceSphere("npcRightEyeWhite",.092,[.085,.070,.212],eyeWhiteMat,[1.03,1.02,.28]);
    const leftEye=faceSphere("npcLeftEye",.043,[-.085,.070,.231],eyeMat,[1,1,.26]);
    const rightEye=faceSphere("npcRightEye",.043,[.085,.070,.231],eyeMat,[1,1,.26]);
    const leftPupil=faceSphere("npcLeftPupil",.023,[-.085,.070,.244],pupilMat,[1,1,.24]);
    const rightPupil=faceSphere("npcRightPupil",.023,[.085,.070,.244],pupilMat,[1,1,.24]);

    const mouth=BABYLON.MeshBuilder.CreateBox("npcMouth",{
      width:.155,height:.034,depth:.012
    },scene);
    mouth.parent=head;
    mouth.position.set(0,-.112,.205);
    mouth.material=pupilMat;

    const upperLip=BABYLON.MeshBuilder.CreateCapsule("npcUpperLip",{
      height:.145,radius:.010,tessellation:10
    },scene);
    upperLip.parent=head;upperLip.rotation.z=Math.PI/2;
    upperLip.position.set(0,-.104,.214);upperLip.material=skinDarkMat;

    const lowerLip=BABYLON.MeshBuilder.CreateCapsule("npcLowerLip",{
      height:.140,radius:.011,tessellation:10
    },scene);
    lowerLip.parent=head;lowerLip.rotation.z=Math.PI/2;
    lowerLip.position.set(0,-.132,.214);lowerLip.material=skinDarkMat;

    const teeth=BABYLON.MeshBuilder.CreateBox("npcTeeth",{
      width:.105,height:.016,depth:.007
    },scene);
    teeth.parent=head;teeth.position.set(0,-.112,.220);teeth.material=teethMat;

    // No separate chin sphere: the jaw mesh above forms the chin naturally.
    // Thin lower-face beard/stubble patch: visual texture only, not another chin ball.
    const beard=BABYLON.MeshBuilder.CreateSphere("npcBeardPatch",{diameter:.355,segments:16},scene);
    beard.parent=head;
    beard.position.set(0,-.085,-.002);
    beard.scaling.set(.91,.55,.83);
    beard.material=beardMat;

    const cheekL=BABYLON.MeshBuilder.CreateSphere("npcCheekL",{diameter:.046,segments:10},scene);
    cheekL.parent=head;
    cheekL.position.set(-.085,-.040,.145);
    cheekL.scaling.set(1.0,.30,.22);
    cheekL.material=skinMat;

    const cheekR=cheekL.clone("npcCheekR");
    cheekR.parent=head;
    cheekR.position.x=.090;

    const eyebrowL=BABYLON.MeshBuilder.CreateBox("npcEyebrowL",{
      width:.135,height:.022,depth:.014
    },scene);
    eyebrowL.parent=head;eyebrowL.position.set(-.088,.165,.242);eyebrowL.rotation.z=-.08;eyebrowL.material=hairMat;
    const eyebrowR=eyebrowL.clone("npcEyebrowR");eyebrowR.parent=head;eyebrowR.position.x=.085;eyebrowR.rotation.z=.08;

    const hairStyle=Math.floor(Math.random()*5);

    const hair=BABYLON.MeshBuilder.CreateSphere("npcHair",{
      diameter:.425,segments:18
    },scene);
    hair.parent=head;
    hair.material=hairMat;

    if(hairStyle===0){
      // Short/receding
      hair.position.set(0,.135,-.055);
      hair.scaling.set(.74,.27,.80);
    }else if(hairStyle===1){
      // Fuller short hair
      hair.position.set(0,.145,-.030);
      hair.scaling.set(.86,.38,.88);
    }else if(hairStyle===2){
      // Flat crop
      hair.position.set(0,.155,-.045);
      hair.scaling.set(.82,.20,.88);
    }else if(hairStyle===3){
      // Taller/messier top
      hair.position.set(0,.175,-.035);
      hair.scaling.set(.72,.48,.78);
    }else{
      // Nearly shaved
      hair.position.set(0,.135,-.045);
      hair.scaling.set(.87,.13,.90);
    }

    if(hairStyle!==4){
      const templeL=faceSphere("npcTempleHairL",.095,[-.155,.095,-.075],hairMat,[.45,.80,.40]);
      const templeR=faceSphere("npcTempleHairR",.095,[.155,.095,-.075],hairMat,[.45,.80,.40]);

      if(hairStyle===1 || hairStyle===3){
        for(const sx of [-1,1]){
          faceSphere("npcSideHair"+sx,.16,[sx*.19,.11,-.08],hairMat,[.48,.88,.50]);
        }
      }
    }

    // Arms with visible overlapping joints.
    const leftUpperArm=capsule("leftUpperArm",.093,skinMat);
    const leftLowerArm=capsule("leftLowerArm",.080,skinMat);
    const rightUpperArm=capsule("rightUpperArm",.093,skinMat);
    const rightLowerArm=capsule("rightLowerArm",.080,skinMat);

    const leftShoulderJoint=jointSphere("leftShoulderJoint",.22,shirtMat);
    const rightShoulderJoint=jointSphere("rightShoulderJoint",.22,shirtMat);
    const leftElbowJoint=jointSphere("leftElbowJoint",.155,skinMat);
    const rightElbowJoint=jointSphere("rightElbowJoint",.155,skinMat);
    const leftWristJoint=jointSphere("leftWristJoint",.125,skinMat);
    const rightWristJoint=jointSphere("rightWristJoint",.125,skinMat);

    const leftHand=jointSphere("leftHand",.195,skinMat);
    leftHand.scaling.set(.78,.78,1.12);
    const rightHand=jointSphere("rightHand",.195,skinMat);
    rightHand.scaling.set(.78,.78,1.12);

    function addFingers(hand,prefix,side){
      for(let i=0;i<3;i++){
        const f=BABYLON.MeshBuilder.CreateCapsule(prefix+"Finger"+i,{
          height:.105-i*.007,radius:.014,tessellation:9
        },scene);
        f.parent=hand;
        f.rotation.x=Math.PI/2;
        f.position.set((i-1)*.032,-.005,.09);
        f.material=skinMat;
      }
      const thumb=BABYLON.MeshBuilder.CreateCapsule(prefix+"Thumb",{
        height:.080,radius:.016,tessellation:9
      },scene);
      thumb.parent=hand;
      thumb.rotation.x=Math.PI/2;
      thumb.rotation.z=side<0?.65:-.65;
      thumb.position.set(side*.065,-.02,.025);
      thumb.material=skinMat;
    }
    addFingers(leftHand,"npcL",-1);
    addFingers(rightHand,"npcR",1);

    // Shirt sleeve cuffs overlap the arm/shoulder connection.
    const leftSleeve=jointSphere("leftSleeve",.205,shirtMat);
    leftSleeve.setEnabled(false);
    const rightSleeve=jointSphere("rightSleeve",.205,shirtMat);
    rightSleeve.setEnabled(false);

    // Legs with visible hip/knee/ankle joints.
    const leftUpperLeg=capsule("leftUpperLeg",.110,pantsMat);
    const leftLowerLeg=capsule("leftLowerLeg",.094,pantsMat);
    const rightUpperLeg=capsule("rightUpperLeg",.110,pantsMat);
    const rightLowerLeg=capsule("rightLowerLeg",.094,pantsMat);

    const leftHipJoint=jointSphere("leftHipJoint",.205,pantsMat);
    const rightHipJoint=jointSphere("rightHipJoint",.205,pantsMat);
    const leftKneeJoint=jointSphere("leftKneeJoint",.175,pantsMat);
    const rightKneeJoint=jointSphere("rightKneeJoint",.175,pantsMat);
    const leftAnkleJoint=jointSphere("leftAnkleJoint",.135,pantsDarkMat);
    const rightAnkleJoint=jointSphere("rightAnkleJoint",.135,pantsDarkMat);

    const leftShoe=capsule("leftShoe",.105,shoeMat);
    const rightShoe=capsule("rightShoe",.105,shoeMat);

    // These pieces still receive updates for compatibility, but are hidden.
    // The continuous tube shells above replace their segmented appearance.
    [
      abdomen,torso,chestPlate,spineJoint,neckJoint,
      leftUpperArm,leftLowerArm,leftShoulderJoint,leftElbowJoint,leftWristJoint,
      rightUpperArm,rightLowerArm,rightShoulderJoint,rightElbowJoint,rightWristJoint,
      leftUpperLeg,leftLowerLeg,leftHipJoint,leftKneeJoint,leftAnkleJoint,
      rightUpperLeg,rightLowerLeg,rightHipJoint,rightKneeJoint,rightAnkleJoint
    ].forEach(m=>m.setEnabled(false));

    const leftSole=BABYLON.MeshBuilder.CreateBox("leftSole",{
      width:.19,height:.035,depth:.31
    },scene);
    leftSole.parent=leftShoe;leftSole.position.set(0,-.05,.02);leftSole.material=soleMat;
    const rightSole=leftSole.clone("rightSole");rightSole.parent=rightShoe;

    // Laces add a little visual detail.
    for(const shoe of [leftShoe,rightShoe]){
      for(let i=0;i<3;i++){
        const lace=BABYLON.MeshBuilder.CreateBox("shoeLace",{
          width:.115,height:.009,depth:.012
        },scene);
        lace.parent=shoe;lace.position.set(0,.035,.025+i*.035);lace.material=paperMat;
      }
    }

    // Belt and collar fill the last obvious body gaps.
    const belt=BABYLON.MeshBuilder.CreateCylinder("npcBelt",{
      height:.055,diameter:.43,tessellation:18
    },scene);
    belt.parent=visual;belt.material=pantsDarkMat;
    belt.rotationQuaternion=BABYLON.Quaternion.Identity();

    const buckle=BABYLON.MeshBuilder.CreateBox("npcBuckle",{
      width:.075,height:.055,depth:.025
    },scene);
    buckle.parent=belt;buckle.position.set(0,0,.22);buckle.material=batMetal;
    buckle.setEnabled(false);

    const collar=BABYLON.MeshBuilder.CreateTorus("npcCollar",{
      diameter:.17,thickness:.016,tessellation:16
    },scene);
    collar.parent=visual;collar.material=shirtDarkMat;
    collar.rotationQuaternion=BABYLON.Quaternion.Identity();
    collar.setEnabled(false);

    // Name badge on shirt.
    const badge=childBox(
      "npcBadge",chestPlate,
      new BABYLON.Vector3(.12,.03,.25),
      new BABYLON.Vector3(.13,.07,.012),
      paperMat,false
    );
    const badgeStripe=childBox(
      "npcBadgeStripe",badge,
      new BABYLON.Vector3(0,.012,-.012),
      new BABYLON.Vector3(.10,.012,.008),
      blueMat,false
    );

    badge.setEnabled(false);
    badgeStripe.setEnabled(false);

    // Shirt seams/buttons.
    const shirtButtons=[];
    for(let i=0;i<4;i++){
      const button=BABYLON.MeshBuilder.CreateCylinder("npcShirtButton"+i,{
        height:.012,diameter:.025,tessellation:10
      },scene);
      button.parent=bodyShell;
      button.rotation.x=Math.PI/2;
      button.position.set(0,.02+i*.11,-.245);
      button.material=paperMat;
      shirtButtons.push(button);
    }

    const shirtPocket=childBox(
      "npcShirtPocket",bodyShell,
      new BABYLON.Vector3(.12,.18,-.24),
      new BABYLON.Vector3(.14,.12,.012),
      shirtDarkMat,false
    );

    const pocketTop=childBox(
      "npcPocketTop",shirtPocket,
      new BABYLON.Vector3(0,.055,-.012),
      new BABYLON.Vector3(.12,.015,.007),
      trimMat,false
    );

    const speech=speechBubble(root);
    const hp=hpLabel(root);
    const weapon=createNpcWeapon(visual);

    npc={
      root,visual,
      bodyShell,shoulderBridge,neckShell,leftSleeveShell,rightSleeveShell,
      leftArmShell,rightArmShell,leftLegShell,rightLegShell,
      abdomen,torso,neck,chestPlate,pelvis,spineJoint,neckJoint,npcButtL,npcButtR,npcSlapPrint,npcFloatHand,
      head,nose,leftEar,rightEar,leftEyeWhite,rightEyeWhite,leftEye,rightEye,leftPupil,rightPupil,
      mouth,upperLip,lowerLip,teeth,beard,cheekL,cheekR,eyebrowL,eyebrowR,hair,
      leftUpperArm,leftLowerArm,leftShoulderJoint,leftElbowJoint,leftWristJoint,leftHand,leftSleeve,
      rightUpperArm,rightLowerArm,rightShoulderJoint,rightElbowJoint,rightWristJoint,rightHand,rightSleeve,
      leftUpperLeg,leftLowerLeg,leftHipJoint,leftKneeJoint,leftAnkleJoint,leftShoe,
      rightUpperLeg,rightLowerLeg,rightHipJoint,rightKneeJoint,rightAnkleJoint,rightShoe,
      belt,collar,badge,badgeStripe,

      parts:[
        bodyShell,shoulderBridge,neckShell,leftSleeveShell,rightSleeveShell,
        leftArmShell,rightArmShell,leftLegShell,rightLegShell,
        abdomen,torso,neck,chestPlate,pelvis,spineJoint,neckJoint,
        head,nose,leftEar,rightEar,leftEyeWhite,rightEyeWhite,leftEye,rightEye,leftPupil,rightPupil,
        mouth,upperLip,lowerLip,teeth,beard,cheekL,cheekR,eyebrowL,eyebrowR,hair,
        leftUpperArm,leftLowerArm,leftShoulderJoint,leftElbowJoint,leftWristJoint,leftHand,leftSleeve,
        rightUpperArm,rightLowerArm,rightShoulderJoint,rightElbowJoint,rightWristJoint,rightHand,rightSleeve,
        leftUpperLeg,leftLowerLeg,leftHipJoint,leftKneeJoint,leftAnkleJoint,leftShoe,
        rightUpperLeg,rightLowerLeg,rightHipJoint,rightKneeJoint,rightAnkleJoint,rightShoe,
        belt,collar,badge,badgeStripe
      ],

      skinParts:[
        leftArmShell,rightArmShell,neckShell,
        neck,neckJoint,head,nose,leftEar,rightEar,cheekL,cheekR,upperLip,lowerLip,
        leftUpperArm,leftLowerArm,leftElbowJoint,leftWristJoint,leftHand,
        rightUpperArm,rightLowerArm,rightElbowJoint,rightWristJoint,rightHand
      ],
      shirtParts:[
        bodyShell,
        abdomen,torso,chestPlate,spineJoint,leftShoulderJoint,rightShoulderJoint,
        leftSleeve,rightSleeve,collar
      ],
      pantsParts:[
        leftLegShell,rightLegShell,
        pelvis,leftUpperLeg,leftLowerLeg,leftHipJoint,leftKneeJoint,leftAnkleJoint,
        rightUpperLeg,rightLowerLeg,rightHipJoint,rightKneeJoint,rightAnkleJoint,belt
      ],
      shoeParts:[leftShoe,rightShoe],

      flashParts:[
        bodyShell,shoulderBridge,leftSleeveShell,rightSleeveShell,
        leftArmShell,rightArmShell,leftLegShell,rightLegShell,
        neckShell,pelvis,head,leftHand,rightHand,
        leftShoe,rightShoe
      ],

      skinMat,skinDarkMat,shirtMat,shirtDarkMat,pantsMat,pantsDarkMat,shoeMat,
      eyeMat,eyeWhiteMat,pupilMat,hairMat,beardMat,
      speech,hp,
      weaponRoot:weapon.root,weaponBase:weapon.base,weaponMid:weapon.mid,weaponTip:weapon.tip,weaponCfg:weapon.cfg,
      weaponDurability:7,weaponBroken:false,pickupCooldown:0,improvisedType:null,

      typeName:archetype.name,
      archetype,
      hpValue:archetype.maxHp,
      maxHp:archetype.maxHp,
      dead:false,
      velocity:new BABYLON.Vector3(0,0,0),
      angular:new BABYLON.Vector3(0,0,0),
      hitCooldown:0,
      hpFlashTimer:0,
      attackCooldown:.35,
      throwCooldown:2.8+Math.random()*1.8,
      recovering:false,
      recoverTimer:0,
      recoverStableTimer:0,
      attackAnim:0,
      weaponPrevBase:null,
      attackDuration:.48,
      attackHasHit:false,
      attackBlocked:false,
      weaponPrevTip:null,
      stun:0,
      walkPhase:0,
      walkingNow:false,
      reactionCooldown:0,
      proximityReactCooldown:0,
      slapPrintTimer:0,slapFloatTimer:0,buttJiggle:0,slapReactTimer:0,slapReactSide:1,
      reactionTimer:0,
      emotion:archetype.preferredEmotion||"normal",
      emotionBurst:0,
      screamKind:null,
      faceStyle:Math.floor(Math.random()*4),
      outfitStyle:Math.floor(Math.random()*4),
      anger:0,
      injuries:{head:0,torso:0,leftArm:0,rightArm:0,leftLeg:0,rightLeg:0},
      faceBlink:1.2+Math.random()*2.2,
      faceBlinkAmount:0,
      lastStepIndex:-1,
      recentlyHit:0,
      respawnTimer:0,
      greeted:false,
      deathPhase:"alive",
      deathExploded:false,
      deathTimer:0,
      deathTotalTimer:0,
      deathDir:new BABYLON.Vector3(0,1,0),
      deathHitPos:new BABYLON.Vector3(),
      deathSpeed:0,
      netTargetId:null,
      ragdoll:null
    };

    npc.parts.forEach(m=>{
      if(m && m.getClassName && m.getClassName()!=="TransformNode") shadowGen.addShadowCaster(m);
    });

    npc.ragdoll=makeNpcRagdoll();
    updateNpcLabel();
    updateNpcRagdollMeshes();
  }
  // IMPORTANT: spawn the first NPC immediately when the scene loads.
  createNpc();
  let waveModifier="NONE";

  function configureNpcForCurrentLevel(){
    if(!npc)return;
    npc.weaponRoot.scaling.set(1,1,1);
    npc.weaponBroken=false;
    npc.improvisedType=null;
    npc.attackAnim=0;
    npc.attackHasHit=false;
    npc.attackBlocked=false;
    npc.weaponPrevBase=null;
    npc.weaponPrevTip=null;
    const p=currentMapProgress(),boss=p.level>=10;if(gameMode==="map")setMusicMode(boss?"boss":"normal");
    npc.variant="NORMAL";npc.bossArmor=0;npc.bossArmorMax=0;npc.bossPhase=1;npc.isMiniBoss=false;
    if(!boss){
      const eliteMul=waveModifier==="DOUBLE ELITE CHANCE"?2:1;
      if((p.level===5||p.level===7)&&Math.random()<Math.min(.90,.55*eliteMul)){npc.variant="MINI-BOSS";npc.isMiniBoss=true;gameState.collectionStats.miniBosses++;}
      else{
        const r=Math.random();
        if(r<.035*eliteMul){npc.variant="GOLDEN";gameState.collectionStats.rareEnemies++;}
        else if(r<.085*eliteMul){npc.variant="ARMORED";gameState.collectionStats.rareEnemies++;}
        else if(r<.135*eliteMul){npc.variant="BERSERK";gameState.collectionStats.rareEnemies++;}
        else if(r<.185*eliteMul){npc.variant="TRICKSTER";gameState.collectionStats.rareEnemies++;}
      }
    }
    const modeMul=gameState.mode==="SURVIVAL"?1.18:gameState.mode==="ENDLESS"?1.28:gameState.mode==="HARDCORE"?1.42:1;
    const speedMul=gameState.mode==="SURVIVAL"?1.06:gameState.mode==="ENDLESS"?1.10:gameState.mode==="HARDCORE"?1.16:1;
    if(boss){
      npc.typeName="BOSS";
      npc.maxHp=Math.round(520*modeMul);npc.hpValue=npc.maxHp;
      npc.archetype={...(npc.archetype||{}),speed:1.28*speedMul,attackMul:1.42*modeMul,knockbackMul:1.35};
      npc.root.scaling.set(1.16,1.16,1.16);npc.anger=80;npc.weaponDurability=Math.round(18*modeMul);
      npc.bossArmorMax=Math.round(150*modeMul);npc.bossArmor=npc.bossArmorMax;npc.bossPhase=1;
    } else {
      const scale=(1+(p.level-1)*.045)*modeMul;
      npc.maxHp=Math.round(npc.maxHp*scale);npc.hpValue=npc.maxHp;
      npc.archetype={...(npc.archetype||{}),speed:(npc.archetype?.speed||1.2)*speedMul,attackMul:(npc.archetype?.attackMul||1)*modeMul};
      npc.root.scaling.set(1,1,1);npc.weaponDurability=Math.max(7,Math.round(7*modeMul));
      if(npc.variant==="MINI-BOSS"){npc.maxHp=Math.round(npc.maxHp*2.2);npc.hpValue=npc.maxHp;npc.root.scaling.set(1.08,1.08,1.08);npc.weaponDurability+=6;}
      else if(npc.variant==="GOLDEN"){npc.maxHp=Math.round(npc.maxHp*1.35);npc.hpValue=npc.maxHp;npc.archetype.speed*=1.08;}
      else if(npc.variant==="ARMORED"){npc.maxHp=Math.round(npc.maxHp*1.55);npc.hpValue=npc.maxHp;npc.weaponDurability+=4;}
      else if(npc.variant==="BERSERK"){npc.maxHp=Math.round(npc.maxHp*1.18);npc.hpValue=npc.maxHp;npc.archetype.speed*=1.24;npc.archetype.attackMul*=1.22;}
      else if(npc.variant==="TRICKSTER"){npc.archetype.speed*=1.15;npc.archetype.throwRate=(npc.archetype.throwRate||1)*1.8;}
    }
    npc.baseSpeed=npc.archetype?.speed||1.3;npc.baseAttackMul=npc.archetype?.attackMul||1;const dm=npcDifficultyMul();npc.baseSpeed*=dm.speed;npc.baseAttackMul*=dm.attack;npc.anger*=dm.anger;updateNpcLabel();
  }
  configureNpcForCurrentLevel();

  function updateNpcLabel() {
    if(!npc?.hp) return;

    const hp=Math.max(0,Math.ceil(npc.hpValue));
    const max=Math.max(1,npc.maxHp||160);
    const pct=BABYLON.Scalar.Clamp(hp/max,0,1);

    npc.hp.text.text=`${npc.variant&&npc.variant!=="NORMAL"?npc.variant+" ":""}${npc.typeName||"NPC"} • ${hp}/${max}${npc.bossArmor>0?` • ARMOR ${Math.ceil(npc.bossArmor)}`:""}`;
    npc.hp.bar.width=`${Math.max(0.01,pct)*100}%`;

    // Every successful hit makes the HP bar flash red.
    npc.hp.bar.background=
      npc.hpFlashTimer>0 ? "#ef4444" : "#22c55e";

    npc.hp.frame.color=
      npc.hpFlashTimer>0 ? "#ffb4b4" : "#d9ffe5";
  }

  function setNpcMaterial() {
    if (!npc || npc.dead) return;

    // No full-body hit color flash.
    npc.bodyShell.material=npc.shirtMat;
    npc.shoulderBridge.material=npc.shirtMat;
    npc.leftSleeveShell.material=npc.shirtMat;
    npc.rightSleeveShell.material=npc.shirtMat;

    npc.leftArmShell.material=npc.skinMat;
    npc.rightArmShell.material=npc.skinMat;
    npc.leftLegShell.material=npc.pantsMat;
    npc.rightLegShell.material=npc.pantsMat;

    npc.neckShell.material=npc.skinMat;
    npc.pelvis.material=npc.pantsMat;
    npc.head.material=npc.skinMat;
        npc.leftHand.material=npc.skinMat;
    npc.rightHand.material=npc.skinMat;
    npc.leftShoe.material=npc.shoeMat;
    npc.rightShoe.material=npc.shoeMat;

    npc.leftEyeWhite.material=npc.eyeWhiteMat;
    npc.rightEyeWhite.material=npc.eyeWhiteMat;
    npc.leftEye.material=npc.eyeMat;
    npc.rightEye.material=npc.eyeMat;
    npc.leftPupil.material=npc.pupilMat;
    npc.rightPupil.material=npc.pupilMat;
    npc.eyebrowL.material=npc.hairMat;
    npc.eyebrowR.material=npc.hairMat;
    npc.hair.material=npc.hairMat;
    if(npc.beard) npc.beard.material=npc.beardMat;
    npc.teeth.material=npc.eyeWhiteMat;
  }
  function npcSphereHit(center,radius) {
    if (!npc || npc.dead || !npc.ragdoll) return false;

    return npc.ragdoll.list.some(p=>{
      const w=npcLocalToWorld(p.pos);
      return BABYLON.Vector3.Distance(center,w)<radius+p.radius;
    });
  }

  function npcBatSweepHit(prevTip,tip,base,radius=.22){
    if(!npc || npc.dead || !npc.ragdoll) return null;

    let best=null;
    let bestDist=Infinity;

    // Approximate previous bat base using the current shaft direction.
    const shaft=tip.subtract(base);
    const prevBase=prevTip.subtract(shaft);

    for(const p of npc.ragdoll.list){
      const world=npcLocalToWorld(p.pos);
      const hitRadius=radius+p.radius;

      const tests=[
        // Fast moving tip.
        pointSegmentDistance(world,prevTip,tip),

        // Current bat shaft.
        pointSegmentDistance(world,base,tip),

        // Previous bat shaft.
        pointSegmentDistance(world,prevBase,prevTip),

        // Swept base.
        pointSegmentDistance(world,prevBase,base)
      ];

      // Sample three intermediate bat shafts too. This closes gaps on
      // very fast controller swings where a thin bat can jump past a limb.
      for(const t of [.25,.50,.75]){
        const a=BABYLON.Vector3.Lerp(prevBase,base,t);
        const b=BABYLON.Vector3.Lerp(prevTip,tip,t);
        tests.push(pointSegmentDistance(world,a,b));
      }

      const d=Math.min(...tests);

      if(d<hitRadius && d<bestDist){
        bestDist=d;
        best={
          point:world.clone(),
          part:p.name,
          distance:d
        };
      }
    }

    return best;
  }

  function resolveNpcWorld(prevY) {
    if (!npc) return;
    if (npc.root.position.y<0) {
      npc.root.position.y=0;
      if (npc.velocity.y<0) npc.velocity.y=0;
    }

    for (const s of [...collisionSurfaces]) {
      if (s===ground || s===outsideGround) continue;

      if(
        s.metadata?.breakableWindow &&
        !s.metadata.broken &&
        npc.velocity.length()>2.30
      ){
        const impact=npc.root.position.add(new BABYLON.Vector3(0,1.05,0));
        if(breakWindow(s,impact,npc.velocity)) continue;
      }

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

  function resolveDeathPart(r) {
    const radius=r.radius||.15;

    for (const s of [...collisionSurfaces]) {
      const hit=surfaceSphereHit(s,r.mesh.position,radius);
      if(!hit) continue;

      if(
        s.metadata?.breakableWindow &&
        !s.metadata.broken &&
        r.vel.length()>2.0
      ){
        if(breakWindow(s,r.mesh.position,r.vel)) continue;
      }

      r.mesh.position.addInPlace(hit.correction);

      const vn=BABYLON.Vector3.Dot(r.vel,hit.normal);
      if(vn<0){
        r.vel.subtractInPlace(hit.normal.scale(vn*1.02));
        r.vel.scaleInPlace(.44);
      }
    }
  }
  function moveDeathPart(r,dt) {
    const delta=r.vel.scale(dt);
    const steps=Math.max(1,Math.ceil(delta.length()/.016));
    const step=delta.scale(1/steps);
    for(let i=0;i<steps;i++){
      r.mesh.position.addInPlace(step);
      resolveDeathPart(r);
    }
  }

  function spawnDeathJointBlood(dir){
    // v0.24.3: blood removed
    return;
    if(!npc?.ragdoll) return;
    const p=npc.ragdoll.points;
    const joints=[
      "neckBase","lShoulder","rShoulder",
      "lElbow","rElbow","lHip","rHip",
      "lKnee","rKnee"
    ];

    joints.forEach((name,i)=>{
      const pt=p[name];
      if(!pt) return;
      const origin=npcLocalToWorld(pt.pos);

      // Small local sprays at separated joints. No internal anatomy is shown.
      const localDir=dir.clone().add(new BABYLON.Vector3(
        (Math.random()-.5)*.65,
        .12+Math.random()*.35,
        (Math.random()-.5)*.65
      ));
      // No blood effect.
    });
  }

  function spawnDeathRagdollFromCurrent(launchDir,force) {
    if(!npc?.ragdoll) return;
    const p=npc.ragdoll.points;

    const dir=launchDir.clone();
    if(dir.lengthSquared()<.001) dir.set(0,1,0);
    dir.normalize();

    function W(name){ return npcLocalToWorld(p[name].pos); }
    function V(name){
      const local=p[name].pos.subtract(p[name].prev).scale(55);
      return rotY(local,npc.root.rotation.y);
    }

    const chestCenter=W("chest");

    function addPiece(mesh,radius,vel){
      // Give every piece its own outward direction from the real torso,
      // instead of making all body parts fly in one identical direction.
      const outward=mesh.position.subtract(chestCenter);
      if(outward.lengthSquared()>.0001){
        outward.normalize();
        vel.addInPlace(outward.scale(.10+Math.random()*.12));
      }

      const maxPieceSpeed=7.2;
      if(vel.length()>maxPieceSpeed){
        vel.normalize().scaleInPlace(maxPieceSpeed);
      }

      deathParts.push({
        mesh,
        vel,
        radius,
        life:2.2,
        age:0,
        sleepTimer:0,
        sleeping:false,
        spin:new BABYLON.Vector3(
          (Math.random()-.5)*4.0,
          (Math.random()-.5)*4.0,
          (Math.random()-.5)*4.0
        )
      });

      while(deathParts.length>PERF.maxDeathParts){
        const old=deathParts.shift();
        old?.mesh?.dispose?.();
      }
    }

    function capsulePiece(name,aName,bName,radius,mat){
      const a=W(aName),b=W(bName);
      const m=BABYLON.MeshBuilder.CreateCapsule(name,{
        height:1,radius,tessellation:14
      },scene);
      m.material=mat;
      setSegment(m,a,b,1);

      const vel=V(aName).add(V(bName)).scale(.58)
        .add(dir.scale(force*.17))
        .add(new BABYLON.Vector3(
          (Math.random()-.5)*.72,
          .18+Math.random()*.58,
          (Math.random()-.5)*.72
        ));
      addPiece(m,Math.max(radius*1.2,BABYLON.Vector3.Distance(a,b)*.26),vel);
    }

    function spherePiece(name,pName,diameter,mat){
      const m=BABYLON.MeshBuilder.CreateSphere(name,{
        diameter,segments:14
      },scene);
      m.position.copyFrom(W(pName));
      m.material=mat;
      const vel=V(pName).scale(.72)
        .add(dir.scale(force*.18))
        .add(new BABYLON.Vector3(
          (Math.random()-.5)*.78,
          .20+Math.random()*.62,
          (Math.random()-.5)*.78
        ));
      addPiece(m,diameter*.5,vel);
    }

    capsulePiece("deathLowerTorso","pelvis","spineLow",.205,npc.shirtDarkMat);
    capsulePiece("deathUpperTorso","spineLow","chest",.265,npc.shirtMat);
    capsulePiece("deathNeck","neckBase","head",.085,npc.skinMat);

    // Head keeps hair and eyes after it separates.
    {
      const m=BABYLON.MeshBuilder.CreateSphere("deathHead",{
        diameter:.415,segments:18
      },scene);
      m.position.copyFrom(W("head"));
      m.scaling.set(.84,1.08,.79);
      m.material=npc.skinMat;

      const jaw=BABYLON.MeshBuilder.CreateSphere("deathJaw",{
        diameter:.29,segments:14
      },scene);
      jaw.parent=m;
      jaw.position.set(0,-.145,.008);
      jaw.scaling.set(.88,.58,.76);
      jaw.material=npc.skinMat;

      const hair=BABYLON.MeshBuilder.CreateSphere("deathHair",{
        diameter:.405,segments:16
      },scene);
      hair.parent=m;
      hair.position.set(0,.135,-.055);
      hair.scaling.set(.86,.34,.86);
      hair.material=npc.hairMat;

      for(const sx of [-1,1]){
        const white=BABYLON.MeshBuilder.CreateSphere("deathEyeWhite",{
          diameter:.050,segments:10
        },scene);
        white.parent=m;
        white.position.set(sx*.068,.060,.192);
        white.scaling.set(1.12,.58,.28);
        white.material=npc.eyeWhiteMat;

        const iris=BABYLON.MeshBuilder.CreateSphere("deathIris",{
          diameter:.022,segments:8
        },scene);
        iris.parent=m;
        iris.position.set(sx*.068,.060,.205);
        iris.material=npc.eyeMat;

        const pupil=BABYLON.MeshBuilder.CreateSphere("deathPupil",{
          diameter:.010,segments:7
        },scene);
        pupil.parent=m;
        pupil.position.set(sx*.068,.060,.214);
        pupil.material=npc.pupilMat;
      }

      const nose=BABYLON.MeshBuilder.CreateSphere("deathNose",{
        diameter:.058,segments:10
      },scene);
      nose.parent=m;
      nose.position.set(0,-.020,.188);
      nose.scaling.set(.72,1,.95);
      nose.material=npc.skinMat;

      const mouth=BABYLON.MeshBuilder.CreateBox("deathMouth",{
        width:.095,height:.020,depth:.008
      },scene);
      mouth.parent=m;
      mouth.position.set(0,-.102,.188);
      mouth.material=npc.pupilMat;

      const vel=V("head").scale(.72)
        .add(dir.scale(force*.26))
        .add(new BABYLON.Vector3(
          (Math.random()-.5)*1.2,
          .35+Math.random()*1.2,
          (Math.random()-.5)*1.2
        ));
      addPiece(m,.21,vel);
    }
    spherePiece("deathPelvis","pelvis",.42,npc.pantsMat);

    // Extra clean clothing fragments make the breakup read more clearly.
    spherePiece("deathLeftShoulder","lShoulder",.20,npc.shirtMat);
    spherePiece("deathRightShoulder","rShoulder",.20,npc.shirtMat);

    capsulePiece("deathLUpperArm","lShoulder","lElbow",.09,npc.skinMat);
    capsulePiece("deathLLowerArm","lElbow","lWrist",.077,npc.skinMat);
    spherePiece("deathLHand","lHand",.17,npc.skinMat);

    capsulePiece("deathRUpperArm","rShoulder","rElbow",.09,npc.skinMat);
    capsulePiece("deathRLowerArm","rElbow","rWrist",.077,npc.skinMat);
    spherePiece("deathRHand","rHand",.17,npc.skinMat);

    capsulePiece("deathLThigh","lHip","lKnee",.105,npc.pantsMat);
    capsulePiece("deathLShin","lKnee","lAnkle",.09,npc.pantsMat);
    capsulePiece("deathLFoot","lAnkle","lFoot",.10,npc.shoeMat);

    capsulePiece("deathRThigh","rHip","rKnee",.105,npc.pantsMat);
    capsulePiece("deathRShin","rKnee","rAnkle",.09,npc.pantsMat);
    capsulePiece("deathRFoot","rAnkle","rFoot",.10,npc.shoeMat);
  }
  function coolDeathBurst(origin) {
    // Stable stylized KO burst: no detached body parts, no blood.
    const flashMat=mkMat("koFlash"+Math.random(),"#ffe08a");
    flashMat.emissiveColor=new BABYLON.Color3(.85,.58,.14);
    flashMat.alpha=.82;

    const ring=BABYLON.MeshBuilder.CreateTorus("koRing",{
      diameter:.38,thickness:.035,tessellation:20
    },scene);
    ring.position.copyFrom(origin);
    ring.rotation.x=Math.PI/2;
    ring.material=flashMat;

    let ringLife=.34;
    const ringObs=scene.onBeforeRenderObservable.add(()=>{
      const dt=Math.min(.033,engine.getDeltaTime()/1000);
      ringLife-=dt;
      ring.scaling.addInPlace(new BABYLON.Vector3(dt*4.2,dt*4.2,dt*4.2));
      flashMat.alpha=Math.max(0,ringLife/.34)*.82;
      if(ringLife<=0){
        scene.onBeforeRenderObservable.remove(ringObs);
        ring.dispose();
        flashMat.dispose();
      }
    });

    const sparkMat=mkMat("koSpark"+Math.random(),"#ffd166");
    sparkMat.emissiveColor=new BABYLON.Color3(.70,.42,.08);

    // Small bounded burst: looks cool without becoming a physics mess.
    for(let i=0;i<8;i++){
      const s=BABYLON.MeshBuilder.CreateSphere("koSpark",{
        diameter:.030+Math.random()*.018,segments:5
      },scene);
      s.position=origin.add(new BABYLON.Vector3(
        (Math.random()-.5)*.18,
        .25+Math.random()*.34,
        (Math.random()-.5)*.18
      ));
      s.material=sparkMat;

      const v=new BABYLON.Vector3(
        (Math.random()-.5)*2.2,
        .9+Math.random()*1.8,
        (Math.random()-.5)*2.2
      );
      let life=.38+Math.random()*.18;

      const obs=scene.onBeforeRenderObservable.add(()=>{
        const dt=Math.min(.033,engine.getDeltaTime()/1000);
        life-=dt;
        v.y-=5.2*dt;
        s.position.addInPlace(v.scale(dt));
        s.scaling.scaleInPlace(.94);
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
    updateNpcFace(0);

    let dir=swingVel.clone();
    if(dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();

    npc.dead=true;
    npc.hpValue=0;
    recordKill();
    npc.hpFlashTimer=.22;
    updateNpcLabel();

    // Keep the health bar for a short instant, then hide it during collapse.
    npc.deathPhase="stagger";
    npc.deathExploded=false;
    npc.deathTimer=.08;
    npc.deathTotalTimer=0;
    npc.ragdoll.dead=false;
    npc.respawnTimer=6.9;
    npc.deathDir=dir.clone();
    npc.deathHitPos=hitPos.clone();
    npc.deathSpeed=speed;

    // Last hit carries real linear momentum.
    const force=Math.min(9.4,2.1+speed*.66);
    npc.velocity.addInPlace(dir.scale(force));
    npc.velocity.y+=Math.max(.25,dir.y*.9+.35);

    // Off-center last hits create visible realistic spin.
    applyNpcSpinKnockback(hitPos,dir,speed,1.65);

    // Local body reaction starts at the actual hit point.
    applyNpcRagdollImpulse(
      hitPos,
      dir.scale(1.25+speed*.48).add(new BABYLON.Vector3(0,.45,0)),
      .88
    );

    coolDeathBurst(hitPos);
    pulse(batHand(),1,145);
    pulse(supportHand(),.38,65);
    playImpactSound("body",1.1);
  }
  function classifyNpcHit(hitWorld){
    if(!npc?.ragdoll){
      return {zone:"torso",mult:1,point:null};
    }

    const groups=[
      {zone:"head",names:["head","neckBase"],mult:1.42},
      {zone:"torso",names:["chest","spineLow","pelvis"],mult:1.00},
      {zone:"rightArm",names:["rShoulder","rElbow","rWrist","rHand"],mult:.72},
      {zone:"leftArm",names:["lShoulder","lElbow","lWrist","lHand"],mult:.72},
      {zone:"rightLeg",names:["rHip","rKnee","rAnkle","rFoot"],mult:.80},
      {zone:"leftLeg",names:["lHip","lKnee","lAnkle","lFoot"],mult:.80}
    ];

    let best={zone:"torso",mult:1,dist:Infinity,point:null};

    for(const group of groups){
      for(const name of group.names){
        const p=npc.ragdoll.points[name];
        if(!p) continue;

        const world=npcLocalToWorld(p.pos);
        const dist=BABYLON.Vector3.Distance(hitWorld,world);

        if(dist<best.dist){
          best={
            zone:group.zone,
            mult:group.mult,
            dist,
            point:p
          };
        }
      }
    }

    return best;
  }

  function applyInjury(zone,damage,speed){
    if(!npc?.injuries) return;

    const amount=damage*(.65+Math.min(1,speed*.06));

    if(zone==="head"){
      npc.injuries.head=Math.min(100,npc.injuries.head+amount*1.40);
      npc.stun=Math.max(
        npc.stun,
        .13+Math.min(.35,damage*.012)
      );
    }else if(zone==="rightArm" || zone==="leftArm"){
      npc.injuries[zone]=Math.min(100,npc.injuries[zone]+amount);
      npc.stun=Math.max(npc.stun,.06);
    }else if(zone==="rightLeg" || zone==="leftLeg"){
      npc.injuries[zone]=Math.min(100,npc.injuries[zone]+amount*1.15);
      npc.stun=Math.max(
        npc.stun,
        .08+Math.min(.20,damage*.008)
      );
    }else{
      npc.injuries.torso=Math.min(
        100,
        npc.injuries.torso+amount*.55
      );
    }
  }

  function applyNpcSpinKnockback(hitWorld,impulseWorld,speed,mult=1){
    if(!npc) return;

    const center=npc.root.position.add(
      new BABYLON.Vector3(0,1.0,0)
    );

    const lever=hitWorld.subtract(center);

    let force=impulseWorld.clone();
    if(force.lengthSquared()<.000001) return;
    force.normalize();

    const torque=BABYLON.Vector3.Cross(lever,force);
    const hardness=BABYLON.Scalar.Clamp((speed-.7)/6,0,1);
    const scale=(.50+hardness*2.10)*mult;

    npc.angular.y+=BABYLON.Scalar.Clamp(
      torque.y*scale,
      -4.6,4.6
    );

    npc.angular.x+=BABYLON.Scalar.Clamp(
      torque.x*scale*.42,
      -1.6,1.6
    );

    npc.angular.z+=BABYLON.Scalar.Clamp(
      torque.z*scale*.42,
      -1.6,1.6
    );

    // Extra yaw from an off-centre horizontal hit.
    npc.angular.y+=BABYLON.Scalar.Clamp(
      (-lever.x*force.z+lever.z*force.x)*speed*.18*mult,
      -2.4,2.4
    );
  }

  function hitStrengthName(speed){
    if(speed<1.45) return "SOFT";
    if(speed<2.45) return "SOFT-MED";
    if(speed<3.65) return "MEDIUM";
    if(speed<5.20) return "MED-HARD";
    return "HARD";
  }

  function swingDamage(speed) {
    // Much lower continuous damage in v0.14.
    // Soft hits can do 1-3, normal swings around the middle,
    // and only very hard swings approach the cap.
    if (speed<.22) return 0;

    const raw = 0.35 + 0.56*Math.pow(speed,1.43);
    return Math.round(Math.max(1,Math.min(24,raw)));
  }



  // ------------------------------------------------------------
  // Run statistics, wave modifiers and map events
  // ------------------------------------------------------------
  let runStats={kills:0,blocks:0,damage:0,hardestHit:0,startTime:0,coinsStart:0,gemsStart:0,destroyedStart:0};
  let mapEventTimer=12;
  let mapEventText="";
  let mapEventTextTimer=0;

  const WAVE_MODIFIERS=["NONE","FAST ENEMIES","HEAVY WEAPONS","ANGRY ENEMIES","DOUBLE ELITE CHANCE"];

  function resetRunStats(forcedModifier=null){
    runStats={kills:0,blocks:0,damage:0,hardestHit:0,startTime:performance.now(),coinsStart:gameState.coins,gemsStart:gameState.gems,destroyedStart:gameState.destroyed};
    waveModifier=(typeof forcedModifier==="string"&&WAVE_MODIFIERS.includes(forcedModifier))
      ? forcedModifier
      : WAVE_MODIFIERS[Math.floor(Math.random()*WAVE_MODIFIERS.length)];
    mapEventTimer=9+Math.random()*8;
    mapEventText="";
    mapEventTextTimer=0;
  }

  function mapEventName(){
    const id=gameState.selectedMap;
    return {
      office:"LIGHTS FLICKER",school:"BELL RUSH",house:"POWER CUT",
      supermarket:"AISLE PANIC",gym:"HEAVY FLOOR",hotel:"FIRE ALARM",
      bank:"SECURITY LOCK",metro:"TRAIN GUST",factory:"CONVEYOR SURGE",
      cinema:"LIGHTS OUT",arcade:"NEON OVERLOAD",city:"TRAFFIC RUSH",
      forest:"WIND GUST",beach:"BIG WAVE",construction:"CRANE SWING",
      mall:"ALARM",police:"LOCKDOWN",hospital:"POWER SURGE",
      lab:"EXPERIMENT PULSE",stadium:"CROWD ROAR",castle:"GATE SLAM",
      farm:"TRACTOR RUMBLE",pirate:"SHIP TILT",amusement:"RIDE SURGE",
      volcano:"LAVA PULSE",space:"AIRLOCK BLAST",alien:"ALIEN PULSE"
    }[id]||"MAP EVENT";
  }

  function applyLocalMapEvent(mapId,label=null){
    if(gameMode!=="map")return;
    mapEventText=label||mapEventName();
    mapEventTextTimer=3.2;
    cameraImpactShake=Math.max(cameraImpactShake,.35);

    if(mapId==="space"){
      bodyVelocity.y+=1.35;
    }else if(mapId==="volcano"){
      if(!playerDead&&!playerDowned)hurtPlayer(4,npc?.root?.position||new BABYLON.Vector3());
    }else if(["factory","metro","pirate","construction"].includes(mapId)){
      bodyVelocity.x+=(Math.random()<.5?-1:1)*1.2;
    }
    playImpactSound("whoosh",.7);
  }

  function triggerMapEvent(){
    if(gameMode!=="map")return;
    const mapId=gameState.selectedMap;
    const label=mapEventName();
    applyLocalMapEvent(mapId,label);

    if(mapId==="space"){
      if(npc&&!npc.dead)npc.velocity.y+=1.0;
    }else if(mapId==="volcano"){
      if(npc&&!npc.dead)npc.hpValue=Math.max(1,npc.hpValue-4);
    }else if(["factory","metro","pirate","construction"].includes(mapId)){
      if(npc&&!npc.dead)npc.velocity.x+=(Math.random()<.5?-1:1)*.9;
    }else if(["lab","alien","arcade"].includes(mapId)){
      if(npc&&!npc.dead)npc.stun=Math.max(npc.stun,.28);
    }

    if(net.isHost&&net.connected)broadcastMatch({t:"mapEvent",map:mapId,label});
  }

  function updateMapSystems(dt){
    if(gameMode!=="map")return;
    if(net.connected&&!net.isHost){mapEventTextTimer=Math.max(0,mapEventTextTimer-dt);return;}
    mapEventTimer-=dt;
    mapEventTextTimer=Math.max(0,mapEventTextTimer-dt);
    if(mapEventTimer<=0){
      triggerMapEvent();
      mapEventTimer=12+Math.random()*10;
    }
    if(npc&&!npc.dead){
      updateBossPhases();
      npc.archetype.speed=npc.baseSpeed||npc.archetype.speed||1.3;
      npc.archetype.attackMul=npc.baseAttackMul||npc.archetype.attackMul||1;
      if(waveModifier==="FAST ENEMIES")npc.archetype.speed=Math.max(npc.archetype.speed,1.55);
      else if(waveModifier==="HEAVY WEAPONS")npc.archetype.attackMul=Math.max(npc.archetype.attackMul||1,1.18);
      else if(waveModifier==="ANGRY ENEMIES")npc.anger=Math.max(npc.anger,72);
    }
  }

  function endRunSummary(bossWin=false){
    const seconds=Math.max(1,Math.round((performance.now()-runStats.startTime)/1000));
    const c=gameState.coins-runStats.coinsStart,g=gameState.gems-runStats.gemsStart;
    return `${bossWin?"BOSS CLEARED!":"RUN"} • ${seconds}s • KOs ${runStats.kills} • Blocks ${runStats.blocks} • Hardest ${runStats.hardestHit.toFixed(1)} m/s • +${c} coins • +${g} gems`;
  }

  // ------------------------------------------------------------
  // Advanced bat combat
  // ------------------------------------------------------------
  let chargeTime=0,chargedHitMultiplier=1,twoHandedBonus=1;
  let combatInputPrev={trigger:false,grip:false};
  let batThrown=false,batRecalling=false,batThrowVel=new BABYLON.Vector3();
  let lastBatWorldVel=new BABYLON.Vector3();
  let abilityCooldown=0;

  const abilityRingMat=mkMat("abilityRingMat","#4fdcff");
  abilityRingMat.emissiveColor=new BABYLON.Color3(.1,.65,.9);
  const abilityRing=BABYLON.MeshBuilder.CreateTorus("abilityRing",{diameter:.102,thickness:.012,tessellation:16},scene);
  abilityRing.parent=batRoot;abilityRing.rotation.x=Math.PI/2;abilityRing.position.z=-.035;abilityRing.material=abilityRingMat;

  function holsterBat(){
    if(!gameState.settings.holsterEnabled||batThrown||batHolstered||holsterCooldown>0)return false;
    batHolstered=true;holsterCooldown=.28;
    batRoot.parent=chestRoot;
    const side=batHandSide()==="left"?-1:1;
    batRoot.position.set(.36*side,-.10,-.31);
    batRoot.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(side>0?-.35:.35,.15,Math.PI/2.7);
    batRoot.setEnabled(true);batTipLast=null;batBaseLast=null;
    return true;
  }

  function drawBatFromHolster(){
    if(!batHolstered)return attachBatToSelectedHand();
    batHolstered=false;holsterCooldown=.28;
    return attachBatToSelectedHand();
  }

  function toggleBatHolster(){
    if(!gameState.settings.holsterEnabled)return false;
    if(!batHolstered&&!batRoot.isEnabled())return false;
    return batHolstered?drawBatFromHolster():holsterBat();
  }

function attachBatToRightHand(){return attachBatToSelectedHand();}

  function throwBat(){
    if(batThrown||batHolstered||!batRoot.isEnabled())return;
    const world=batRoot.getAbsolutePosition().clone();
    const rot=batRoot.absoluteRotationQuaternion?.clone()||BABYLON.Quaternion.Identity();
    batRoot.parent=null;
    batRoot.position.copyFrom(world);
    batRoot.rotationQuaternion=rot;
    batThrown=true;batRecalling=false;batTipLast=null;
    let v=lastBatWorldVel.clone();
    if(v.length()<2){
      const f=xrCamera?.getForwardRay(1).direction.clone()||new BABYLON.Vector3(0,.1,1);
      v=f.scale(5.5);
    }
    batThrowVel.copyFrom(v.scale(.82));
    playImpactSound("whoosh",.7);
  }

  function recallBat(){
    if(!batThrown)return;
    batRecalling=true;
  }

  function updateThrownBat(dt){
    if(!batThrown)return;

    const bh=batHand();
    const target=bh?.node
      ? (bh.node.getAbsolutePosition?.()||bh.node.position)
      : (xrCamera?xrCamera.position.add(xrCamera.getForwardRay(1).direction.scale(.35)):null);

    if(!target)return;
    if(batRecalling){
      const to=target.subtract(batRoot.position);
      const d=to.length();
      if(d<.18){attachBatToRightHand();return;}
      if(d>.001){to.normalize();batRoot.position.addInPlace(to.scale(Math.min(d,9.5*dt)));}
      return;
    }

    batThrowVel.y-=5.0*dt;
    if(batThrowVel.length()>12)batThrowVel.normalize().scaleInPlace(12);
    batRoot.position.addInPlace(batThrowVel.scale(dt));
    batRoot.rotation.x+=dt*7.5;
    batRoot.rotation.z+=dt*4.4;
    if(batRoot.position.y<.16){
      batRoot.position.y=.16;
      if(batThrowVel.y<0)batThrowVel.y*=-.22;
      batThrowVel.x*=.68;batThrowVel.z*=.68;
      if(Math.abs(batThrowVel.y)<.18&&Math.hypot(batThrowVel.x,batThrowVel.z)<.20)batThrowVel.set(0,0,0);
    }
  }

  function updateAdvancedCombatInput(dt){
    abilityCooldown=Math.max(0,abilityCooldown-dt);
    holsterCooldown=Math.max(0,holsterCooldown-dt);
    const ready=abilityCooldown<=0;
    abilityRingMat.emissiveColor=ready?new BABYLON.Color3(.1,.65,.9):new BABYLON.Color3(.05,.12,.15);

    const bh=batHand(),sh=supportHand();
    const trig=btn(bh,0);
    const throwBtn=btn(bh,3);

    if(!quickMenuOpen&&!batThrown){
      if(trig)chargeTime=Math.min(1.5,chargeTime+dt);
      if(!trig&&combatInputPrev.trigger&&chargeTime>.30){
        chargedHitMultiplier=1+Math.min(.70,chargeTime*.42);
        chargeTime=0;
      }else if(!trig&&!combatInputPrev.trigger)chargeTime=Math.max(0,chargeTime-dt*2);
    }

    if(throwBtn&&!combatInputPrev.grip&&!quickMenuOpen){
      const bhPos=bh?.node?(bh.node.getAbsolutePosition?.()||bh.node.position):null;
      const bodyPos=chestRoot?.getAbsolutePosition?.()||chestRoot?.position;
      const nearHolster=!!(bhPos&&bodyPos&&BABYLON.Vector3.Distance(bhPos,bodyPos)<.72);
      if(gameState.settings.holsterEnabled&&(batHolstered||nearHolster))toggleBatHolster();
      else if(batThrown)recallBat();
      else throwBat();
    }

    twoHandedBonus=1;
    if(!batThrown&&btn(sh,1)&&sh?.node){
      const lp=sh.node.getAbsolutePosition?.()||sh.node.position;
      if(BABYLON.Vector3.Distance(lp,batBase())<.32)twoHandedBonus=1.25;
    }

    combatInputPrev.trigger=trig;
    combatInputPrev.grip=throwBtn;
  }

  function applyDirectNpcDamage(amount){
    if(!npc||npc.dead||amount<=0)return 0;
    let dmg=Math.max(0,amount);
    if(npc.bossArmor>0){
      const absorb=Math.min(npc.bossArmor,dmg);
      npc.bossArmor=Math.max(0,npc.bossArmor-absorb);
      dmg-=absorb;
      if(npc.bossArmor<=0)npc.stun=Math.max(npc.stun,.65);
    }
    if(dmg>0)npc.hpValue-=dmg;
    updateNpcLabel();
    return dmg;
  }

  function applySelectedBatAbility(hitPos,dir,speed,damage){
    if(!npc||npc.dead||abilityCooldown>0)return;const b=selectedBatData(),lv=selectedBatState().level;
    abilityCooldown=Math.max(.38,1.15-lv*.012);
    npc.statusBurn=npc.statusBurn||0;npc.statusPoison=npc.statusPoison||0;npc.statusSlow=npc.statusSlow||0;npc.statusTick=npc.statusTick||0;
    if(b.id==="lava")npc.statusBurn=Math.max(npc.statusBurn,2.5+lv*.055);
    else if(b.id==="shock"||b.id==="ruler"){npc.stun=Math.max(npc.stun,.14+lv*.006);applyDirectNpcDamage(Math.max(1,Math.round(1+lv*.07)));}
    else if(b.id==="ice")npc.statusSlow=Math.max(npc.statusSlow,1.5+lv*.045);
    else if(b.id==="wind"||b.id==="captain")npc.velocity.addInPlace(dir.scale(.35+lv*.025));
    else if(b.id==="heavy"||b.id==="ceo"||b.id==="industrial")npc.stun=Math.max(npc.stun,.14+lv*.008);
    else if(b.id==="magnet"){let p=playerWorldPos().subtract(npc.root.position);p.y=.08;if(p.lengthSquared()>.001){p.normalize();npc.velocity.addInPlace(p.scale(.28+lv*.018));}}
    else if(b.id==="poison")npc.statusPoison=Math.max(npc.statusPoison,3+lv*.06);
    else if(b.id==="ghost"){npc.hitCooldown=Math.min(npc.hitCooldown,.08);applyDirectNpcDamage(Math.max(1,Math.round(lv*.055)));}
    else if(b.id==="gravity")npc.velocity.y+=.3+lv*.025;
    else if(b.id==="alien"){npc.velocity.y+=.18+lv*.015;npc.stun=Math.max(npc.stun,.12+lv*.004);}
  }

  function damageNpc(hitPos,swingVel,speed) {
    if(netGuestHit(hitPos,swingVel,speed))return;
    if (!npc || npc.dead || npc.hitCooldown>0) return;

    const hit=classifyNpcHit(hitPos);
    const baseDamage=swingDamage(speed);
    if(baseDamage<=0) return;
    const damage=Math.max(1,Math.round(baseDamage*hit.mult*chargedHitMultiplier*twoHandedBonus));
    if(chargedHitMultiplier>1.05){cameraImpactShake=Math.max(cameraImpactShake,.65);chargedHitMultiplier=1;}

    let finalDamage=damage;
    if(npc.bossArmor>0){
      const weak=hit.zone==="head";
      const armorDamage=Math.min(npc.bossArmor,Math.round(damage*(weak?1.45:.85)));
      npc.bossArmor=Math.max(0,npc.bossArmor-armorDamage);
      finalDamage=weak?Math.max(1,Math.round(damage*.40)):Math.max(1,Math.round(damage*.12));
      if(npc.bossArmor<=0){npc.stun=Math.max(npc.stun,.75);playImpactSound("metal",1.15);}
    }
    npc.hpValue-=finalDamage;
    runStats.damage+=finalDamage;runStats.hardestHit=Math.max(runStats.hardestHit,speed);
    if(speed>5.2)reactNpc("heavyHit",BABYLON.Scalar.Clamp(speed/10,.5,1.4));
    npc.hitCooldown=.18;
    npc.recentlyHit=.24;
    npc.hpFlashTimer=.20;
    npc.stun=Math.max(npc.stun,Math.min(.30,Math.max(0,speed-2)*.035));
    applyInjury(hit.zone,damage,speed);

    if(npc.hpValue<=0){
      finishNpc(hitPos,swingVel,speed);
      return;
    }

    updateNpcLabel();

    let dir=swingVel.clone();
    if(dir.lengthSquared()<.001) dir=npc.root.position.subtract(hitPos);
    dir.normalize();
    applySelectedBatAbility(hitPos,dir,speed,damage);
    addBatXP(Math.max(1,Math.round(damage*.18)));
    if(npc.hpValue<=0){finishNpc(hitPos,swingVel,speed);return;}

    const force=Math.min(4.4,.32+speed*.27);
    npc.velocity.addInPlace(dir.scale(force*.62));
    npc.velocity.y+=Math.max(0,dir.y)*.85;

    const boost=hit.zone==="head"?1.22:hit.zone.includes("Leg")?1.05:1;
    applyNpcRagdollImpulse(
      hitPos,dir.scale((.9+speed*.34)*boost),
      hit.zone==="head"?.72:.95
    );

    applyNpcSpinKnockback(hitPos,dir,speed,1);

    playImpactSound("body",Math.min(1.2,.25+speed*.055));

    npc.anger=Math.min(100,npc.anger+12+damage*.9);
    if(npc.hpValue<=30){
      npc.emotion="scared";speakNpc(Math.random()<.55?"scared":"angry",false);
    }else if(npc.anger>=55){
      npc.emotion="angry";speakNpc(Math.random()<.62?"furious":"angry",false);
    }else{
      npc.emotion="angry";speakNpc(speed>3?"angry":"hurt",false);
    }

    pulse(batHand(),Math.min(1,.12+speed*.12),28+Math.min(105,speed*8));
  }


  function mapEnemyRole(){
    return {
      office:"OFFICE WORKER",school:"HALL MONITOR",house:"INTRUDER",supermarket:"SECURITY",
      gym:"GYM ENFORCER",hotel:"HOTEL SECURITY",bank:"VAULT GUARD",metro:"TRANSIT GUARD",
      factory:"FOREMAN",cinema:"USHER",arcade:"ARCADE GUARD",city:"STREET BRAWLER",
      forest:"RANGER",beach:"BEACH BRAWLER",construction:"SITE FOREMAN",mall:"MALL SECURITY",
      police:"OFFICER",hospital:"ORDERLY",lab:"LAB SECURITY",stadium:"STADIUM GUARD",
      castle:"KNIGHT",farm:"FARMHAND",pirate:"PIRATE",amusement:"PARK SECURITY",
      volcano:"LAVA GUARD",space:"SPACE GUARD",alien:"ALIEN WARRIOR"
    }[gameState.selectedMap]||"NPC";
  }

  function updateAdaptiveNpc(){
    if(!npc||npc.dead||npc.typeName==="BOSS")return;
    if(npc.variant==="NORMAL")npc.typeName=mapEnemyRole();
    // Simple combat memory: if the player destroys lots of props, NPC throws more.
    const runDestroyed=Math.max(0,gameState.destroyed-(runStats.destroyedStart||0));
    if(runDestroyed>8)npc.archetype.throwRate=Math.max(npc.archetype.throwRate||1,1.45);
    // Many blocks in THIS run -> slightly more feints/slower approach.
    if(runStats.blocks>12)npc.archetype.speed=Math.max(.95,(npc.archetype.speed||1.3)*.94);
  }

  function updateBossPhases(){
    if(!npc||npc.dead||npc.typeName!=="BOSS")return;
    const pct=npc.hpValue/Math.max(1,npc.maxHp);
    const phase=pct>.62?1:pct>.28?2:3;
    if(phase!==npc.bossPhase){
      npc.bossPhase=phase;
      npc.stun=Math.max(npc.stun,.35);
      npc.anger=100;
      cameraImpactShake=.9;
      playImpactSound("metal",1.2);
    }
    const phaseMul=phase===1?1:phase===2?1.16:1.34;
    npc.attackDuration=Math.max(.28,(npc.weaponCfg?.duration||.62)/phaseMul);
  }

  function breakNpcWeapon(){if(!npc||npc.weaponBroken)return;npc.weaponBroken=true;npc.weaponDurability=0;npc.attackAnim=0;npc.attackHasHit=true;npc.weaponRoot.setEnabled(false);npc.pickupCooldown=.9;npc.stun=Math.max(npc.stun,.42);reactNpc("weaponBreak",1);speakNpc("scared",true);playImpactSound("metal",1);}
  function npcPickupMapWeapon(){
    if(!npc||!npc.weaponBroken||npc.pickupCooldown>0)return false;
    let type="mapObject";

    if(gameState.selectedMap==="office"){
      const allowed=["chair","keyboard","mug","monitor","bin","plant","phone"];
      const c=officeProps.filter(p=>
        !p.broken &&
        allowed.includes(p.type) &&
        BABYLON.Vector3.Distance(
          p.root.getAbsolutePosition?.()||p.root.position,
          npc.root.position
        )<7.5
      );

      // No fake replacement: stay disarmed until a real object is available.
      if(!c.length){
        npc.pickupCooldown=.35;
        return false;
      }

      c.sort((a,b)=>
        BABYLON.Vector3.Distance(a.root.getAbsolutePosition?.()||a.root.position,npc.root.position)-
        BABYLON.Vector3.Distance(b.root.getAbsolutePosition?.()||b.root.position,npc.root.position)
      );

      const p=c[0];
      type=p.type;
      p.broken=true;
      p.respawnTimer=30;
      p.loose=false;
      p.destructionRewarded=true;
      p.hitMeshes.forEach(m=>{
        if(m){
          removeCollision(m);
          m.setEnabled?.(false);
        }
      });
      p.root.setEnabled(false);
    }

    npc.improvisedType=type;
    npc.emotion="angry";
    npc.emotionBurst=.65;
    npc.weaponDurability={
      mug:2,keyboard:3,phone:3,plant:3,monitor:4,chair:6,bin:5,mapObject:4
    }[type]||4;

    npc.weaponBroken=false;
    npc.weaponRoot.setEnabled(true);
    const s=type==="chair"?1.25:type==="mug"?.72:.95;
    npc.weaponRoot.scaling.set(s,s,s);
    npc.pickupCooldown=.45;
    return true;
  }


  // ------------------------------------------------------------
  // In-game quick menu (left menu / three-lines button)
  // ------------------------------------------------------------
  let quickMenuOpen=false;let quickMenuDebounce=0;
  let quickMenuIndex=0;
  let quickMenuPage="MAIN";
  const QUICK_MENU_ITEMS=["RESUME","LOBBY","CAMERA SETTINGS","MUSIC","CHAT","SOUND EFFECTS","GAME SETTINGS"];
  function quickMenuCount(){
    if(quickMenuPage==="CAMERA")return 10;
    if(quickMenuPage==="GAME")return 7;
    return QUICK_MENU_ITEMS.length;
  }

  const quickMenuRoot=new BABYLON.TransformNode("quickMenuRoot",scene);
  quickMenuRoot.setEnabled(false);

  const quickMenuPlane=BABYLON.MeshBuilder.CreatePlane("quickMenuPlane",{width:1.16,height:1.38},scene);
  quickMenuPlane.parent=quickMenuRoot;
  quickMenuPlane.isPickable=false;

  const quickMenuGui=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(quickMenuPlane,900,1020);
  const quickBg=new BABYLON.GUI.Rectangle();
  quickBg.background="#07111FF2";
  quickBg.color="#67D6FF";
  quickBg.thickness=6;
  quickBg.cornerRadius=34;
  quickMenuGui.addControl(quickBg);

  const quickText=new BABYLON.GUI.TextBlock();
  quickText.color="white";
  quickText.fontSize=48;
  quickText.fontWeight="700";
  quickText.textHorizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  quickText.textVerticalAlignment=BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  quickText.paddingLeft="45px";
  quickText.paddingRight="35px";
  quickText.paddingTop="40px";
  quickText.textWrapping=true;
  quickBg.addControl(quickText);

  function quickMenuText(){
    const boss=currentMapProgress().level>=10&&gameMode==="map";
    let vals,title=boss?"⚠ BOSS FIGHT ⚠":"QUICK MENU";

    if(quickMenuPage==="CAMERA"){
      title="CAMERA SETTINGS";
      vals=[
        `MODE: ${gameState.settings.cameraMode}`,
        `DISTANCE: ${(gameState.settings.cameraDistance||1.8).toFixed(1)}m`,
        `HEIGHT: ${(gameState.settings.cameraHeight??.35).toFixed(2)}m`,
        `SMOOTH: ${gameState.settings.cameraSmooth}`,
        `FOV: ${gameState.settings.cameraFov}°`,
        `FORMAT: ${gameState.settings.cameraAspect}`,
        `HUD IN CAMERA: ${gameState.settings.cameraHud?"ON":"OFF"}`,
        `CAMERA SHAKE: ${gameState.settings.cameraShake?"ON":"OFF"}`,
        `CAMERA PROP: ${cameraHeld?"ON":"OFF"}`,
        "BACK"
      ];
    }else if(quickMenuPage==="GAME"){
      title="GAME SETTINGS";
      vals=[
        `HAPTICS: ${Math.round((gameState.settings.hapticStrength??.85)*100)}%`,
        `DOMINANT HAND: ${dominantHandSide().toUpperCase()}`,
        `PERFORMANCE: ${gameState.settings.performanceMode}`,
        "COMFORT VIGNETTE: NOT ACTIVE",
        "TURNING: PHYSICAL",
        `HUD: ${hudPlane.isEnabled()?"ON":"OFF"}`,
        "BACK"
      ];
    }else{
      vals=[
        "RESUME",
        "LOBBY",
        "CAMERA SETTINGS",
        `MUSIC: ${volumePct(gameState.settings.musicVolume)}`,
        `CHAT: ${volumePct(gameState.settings.chatVolume)}`,
        `SFX: ${volumePct(gameState.settings.sfxVolume)}`,
        "GAME SETTINGS"
      ];
    }

    return `${title}\n\n${vals.map((x,i)=>(i===quickMenuIndex?"▶ ":"   ")+x).join("\n")}\n\n${dominantHandSide().toUpperCase()} STICK = choose\n${dominantHandSide().toUpperCase()} TRIGGER = select\n${menuHandSide().toUpperCase()} MENU = close`;
  }

  function refreshQuickMenu(){
    quickText.text=quickMenuText();
  }

  function placeQuickMenu(){
    if(!quickMenuOpen)return;

    // Controller-attached VR menu: floats above the LEFT controller.
    const mh=menuHand();
    if(mh?.grip){
      const wm=mh.grip.getWorldMatrix();
      const p=BABYLON.Vector3.TransformCoordinates(
        new BABYLON.Vector3(.03,.34,-.18),
        wm
      );
      quickMenuRoot.position.copyFrom(p);

      // Keep panel readable by facing the player's head.
      if(xrCamera){
        const target=xrCamera.position.clone();
        target.y=p.y;
        quickMenuRoot.lookAt(target);
        quickMenuRoot.rotation.y+=Math.PI;
      }
      return;
    }

    // Tracking fallback.
    if(xrCamera){
      const f=xrCamera.getForwardRay(1).direction.clone();
      f.y=0;
      if(f.lengthSquared()<.001)f.set(0,0,1);
      f.normalize();
      const p=xrCamera.position.add(f.scale(1.1));
      p.y=xrCamera.position.y-.10;
      quickMenuRoot.position.copyFrom(p);
      quickMenuRoot.lookAt(new BABYLON.Vector3(xrCamera.position.x,p.y,xrCamera.position.z));
      quickMenuRoot.rotation.y+=Math.PI;
    }
  }

  function openQuickMenu(){
    quickMenuOpen=true;
    quickMenuPage="MAIN";
    quickMenuIndex=0;
    quickMenuRoot.setEnabled(true);
    refreshQuickMenu();
    placeQuickMenu();
    bodyVelocity.set(0,0,0);
  }

  function closeQuickMenu(){
    quickMenuOpen=false;
    quickMenuRoot.setEnabled(false);
  }

  function toggleQuickMenu(){
    if(quickMenuDebounce>0)return;
    quickMenuDebounce=.28;
    if(quickMenuOpen)closeQuickMenu();
    else openQuickMenu();
  }

  function activateQuickMenu(){
    if(!quickMenuOpen)return;

    if(quickMenuPage==="CAMERA"){
      if(quickMenuIndex===0)cycleListSetting("cameraMode",CAMERA_MODES);
      else if(quickMenuIndex===1)cycleListSetting("cameraDistance",CAMERA_DISTANCES);
      else if(quickMenuIndex===2)cycleListSetting("cameraHeight",CAMERA_HEIGHTS);
      else if(quickMenuIndex===3)cycleListSetting("cameraSmooth",CAMERA_SMOOTH);
      else if(quickMenuIndex===4)cycleListSetting("cameraFov",CAMERA_FOV);
      else if(quickMenuIndex===5)cycleListSetting("cameraAspect",CAMERA_ASPECT);
      else if(quickMenuIndex===6){gameState.settings.cameraHud=!gameState.settings.cameraHud;saveGame();}
      else if(quickMenuIndex===7){gameState.settings.cameraShake=!gameState.settings.cameraShake;saveGame();}
      else if(quickMenuIndex===8)toggleCameraHeld();
      else {quickMenuPage="MAIN";quickMenuIndex=2;}
      refreshQuickMenu();return;
    }

    if(quickMenuPage==="GAME"){
      if(quickMenuIndex===0){
        const vals=[0,.25,.5,.75,1],cur=gameState.settings.hapticStrength??.85;
        let i=vals.reduce((b,v,j)=>Math.abs(v-cur)<Math.abs(vals[b]-cur)?j:b,0);
        gameState.settings.hapticStrength=vals[(i+1)%vals.length];saveGame();
      }else if(quickMenuIndex===1){saveControlChoice("dominantHand",oppositeHand(dominantHandSide()));}
      else if(quickMenuIndex===2){gameState.settings.performanceMode=gameState.settings.performanceMode==="PERFORMANCE"?"QUALITY":"PERFORMANCE";applyPerformanceMode();saveGame();}
      else if(quickMenuIndex===3){lastLobbyMessage="Comfort vignette is not active in this WebXR build.";}
      else if(quickMenuIndex===4){lastLobbyMessage="Turning uses your real body/head movement in this build.";}
      else if(quickMenuIndex===5){hudPlane.setEnabled(!hudPlane.isEnabled());}
      else {quickMenuPage="MAIN";quickMenuIndex=6;}
      refreshQuickMenu();return;
    }

    if(quickMenuIndex===0)closeQuickMenu();
    else if(quickMenuIndex===1){closeQuickMenu();goLobby();}
    else if(quickMenuIndex===2){quickMenuPage="CAMERA";quickMenuIndex=0;refreshQuickMenu();}
    else if(quickMenuIndex===3){cycleAudioSetting("musicVolume");refreshQuickMenu();}
    else if(quickMenuIndex===4){cycleAudioSetting("chatVolume");refreshQuickMenu();}
    else if(quickMenuIndex===5){cycleAudioSetting("sfxVolume");refreshQuickMenu();}
    else if(quickMenuIndex===6){quickMenuPage="GAME";quickMenuIndex=0;refreshQuickMenu();}
  }


  // ------------------------------------------------------------
  // Advanced content camera
  // ------------------------------------------------------------
  const CAMERA_MODES=["1ST","2ND","3RD","FOLLOW","SELFIE","BOSS","FREE"];
  const CAMERA_DISTANCES=[.8,1.3,1.8,2.6,3.6];
  const CAMERA_HEIGHTS=[-.2,0,.35,.7,1.1];
  const CAMERA_SMOOTH=[.04,.10,.18,.32,.55];
  const CAMERA_FOV=[55,70,85,100];
  const CAMERA_ASPECT=["16:9","9:16","1:1"];

  const contentCamera=new BABYLON.FreeCamera("contentCamera",new BABYLON.Vector3(0,1.6,-2),scene);
  contentCamera.minZ=.05;
  contentCamera.fov=(gameState.settings.cameraFov||72)*Math.PI/180;
  let contentCameraReady=false;
  let freeCamSavedPos=null;
  let cameraImpactShake=0;

  function cycleListSetting(key,list){
    const cur=gameState.settings[key];
    let i=list.indexOf(cur);
    if(i<0){
      let best=0,bd=Infinity;
      for(let j=0;j<list.length;j++){
        const d=typeof cur==="number"?Math.abs(list[j]-cur):(list[j]===cur?0:999);
        if(d<bd){bd=d;best=j;}
      }
      i=best;
    }
    gameState.settings[key]=list[(i+1)%list.length];if(key==="cameraMode"&&gameState.settings[key]==="FREE"){
      freeCamSavedPos=contentCameraReady
        ? contentCamera.position.clone()
        : cameraPlayerTarget().add(new BABYLON.Vector3(0,.6,-1.6));
    }saveGame();
  }

  function cameraPlayerTarget(){
    return playerWorldPos().add(new BABYLON.Vector3(0,-.15,0));
  }

  function updateContentCamera(dt){
    if(!xrCamera)return;
    const mode=gameState.settings.cameraMode||"FOLLOW";if(mode!=="FREE")freeCamSavedPos=null;
    const target=cameraPlayerTarget();
    let desired=contentCamera.position.clone();
    const forward=xrCamera.getForwardRay(1).direction.clone();
    forward.y=0;
    if(forward.lengthSquared()<.001)forward.set(0,0,1);
    forward.normalize();
    const right=new BABYLON.Vector3(forward.z,0,-forward.x);
    const dist=gameState.settings.cameraDistance||1.8;
    const h=gameState.settings.cameraHeight??.35;

    if(mode==="1ST"){
      desired=xrCamera.position.clone();
      desired.y+=.02;
      contentCamera.position.copyFrom(desired);
      contentCamera.rotationQuaternion=xrCamera.rotationQuaternion?.clone()||BABYLON.Quaternion.Identity();
      contentCameraReady=true;
      return;
    }else if(mode==="2ND"){
      desired=target.subtract(forward.scale(dist*.75)).add(right.scale(dist*.55)).add(new BABYLON.Vector3(0,h,0));
    }else if(mode==="3RD"||mode==="FOLLOW"){
      desired=target.subtract(forward.scale(dist)).add(new BABYLON.Vector3(0,h,0));
    }else if(mode==="SELFIE"){
      desired=target.add(forward.scale(dist*.85)).add(new BABYLON.Vector3(0,h,0));
    }else if(mode==="BOSS" && npc && !npc.dead && npc.root?.isEnabled()){
      const bossPos=npc.root.position.add(new BABYLON.Vector3(0,1.1,0));
      const mid=target.add(bossPos).scale(.5);
      let away=target.subtract(bossPos);away.y=0;
      if(away.lengthSquared()<.001)away.set(1,0,0);
      away.normalize();
      const side=new BABYLON.Vector3(away.z,0,-away.x);
      desired=mid.add(side.scale(dist*1.25)).add(new BABYLON.Vector3(0,h+.45,0));
    }else if(mode==="FREE"){
      if(!freeCamSavedPos)freeCamSavedPos=contentCamera.position.clone();
      desired=freeCamSavedPos.clone();
    }else if(mode==="BOSS"){
      desired=target.subtract(forward.scale(dist)).add(new BABYLON.Vector3(0,h,0));
    }

    const smooth=mode==="FOLLOW"?(gameState.settings.cameraSmooth||.18):Math.min(.10,gameState.settings.cameraSmooth||.18);
    const blend=1-Math.exp(-dt/Math.max(.02,smooth));
    contentCamera.position=BABYLON.Vector3.Lerp(contentCamera.position,desired,blend);

    const lookTarget=(mode==="BOSS"&&npc&&!npc.dead&&npc.root?.isEnabled())
      ? target.add(npc.root.position.add(new BABYLON.Vector3(0,1.0,0))).scale(.5)
      : target;

    if(mode!=="FREE")contentCamera.setTarget(lookTarget);
    contentCamera.fov=(gameState.settings.cameraFov||72)*Math.PI/180;

    if(gameState.settings.cameraShake&&cameraImpactShake>0){
      cameraImpactShake=Math.max(0,cameraImpactShake-dt*3.2);
      contentCamera.position.x+=(Math.random()-.5)*cameraImpactShake*.025;
      contentCamera.position.y+=(Math.random()-.5)*cameraImpactShake*.018;
    }

    contentCameraReady=true;
  }

  function captureWithContentCamera(){
    const aspect=gameState.settings.cameraAspect||"16:9";
    const size=aspect==="9:16"?{width:720,height:1280}:aspect==="1:1"?{width:900,height:900}:{width:1280,height:720};
    const hudWasEnabled=hudPlane?.isEnabled?.()??true;
    let hudRestored=false;
    const restoreHud=()=>{
      if(hudRestored)return;
      hudRestored=true;
      if(!gameState.settings.cameraHud)hudPlane?.setEnabled?.(hudWasEnabled);
    };
    if(!gameState.settings.cameraHud)hudPlane?.setEnabled?.(false);
    let safetyTimer=null;
    try{
      if(BABYLON.Tools?.CreateScreenshotUsingRenderTarget&&contentCameraReady){
        safetyTimer=setTimeout(restoreHud,1800);
        BABYLON.Tools.CreateScreenshotUsingRenderTarget(
          engine,contentCamera,size,
          data=>{
            if(safetyTimer)clearTimeout(safetyTimer);
            try{
              const a=document.createElement("a");
              a.href=data;a.download=`crazy-office-${gameState.settings.cameraMode}-${Date.now()}.png`;
              document.body.appendChild(a);a.click();a.remove();
              lastLobbyMessage="Photo captured.";
            }catch(_){lastLobbyMessage="Browser blocked photo saving.";}
            restoreHud();
          },
          "image/png"
        );
        return true;
      }
    }catch(_){
      if(safetyTimer)clearTimeout(safetyTimer);
    }
    restoreHud();
    return false;
  }

  // ------------------------------------------------------------
  // Handheld VR camera
  // ------------------------------------------------------------
  let cameraHeld=false,cameraCooldown=0;
  const vrCameraRoot=new BABYLON.TransformNode("vrCameraRoot",scene);
  const vrCameraBody=BABYLON.MeshBuilder.CreateBox("vrCameraBody",{width:.19,height:.12,depth:.08},scene);
  vrCameraBody.parent=vrCameraRoot;vrCameraBody.material=darkTrimMat;
  const vrCameraLens=BABYLON.MeshBuilder.CreateCylinder("vrCameraLens",{diameter:.065,height:.05,tessellation:16},scene);
  vrCameraLens.parent=vrCameraRoot;vrCameraLens.rotation.x=Math.PI/2;vrCameraLens.position.z=-.06;vrCameraLens.material=lobbyAccent;
  const vrCameraScreen=BABYLON.MeshBuilder.CreatePlane("vrCameraScreen",{width:.12,height:.065},scene);
  vrCameraScreen.parent=vrCameraRoot;vrCameraScreen.position.z=.041;vrCameraScreen.rotation.y=Math.PI;
  const vrCamGui=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(vrCameraScreen,320,180);
  const vrCamText=new BABYLON.GUI.TextBlock();vrCamText.text="CAM";vrCamText.color="white";vrCamText.fontSize=62;vrCamGui.addControl(vrCamText);
  vrCameraRoot.setEnabled(false);

  function toggleCameraHeld(){
    cameraHeld=!cameraHeld;vrCameraRoot.setEnabled(cameraHeld);
    lastLobbyMessage=cameraHeld?"Camera ON — use right secondary button for photo.":"Camera OFF";if(quickMenuOpen)refreshQuickMenu();
  }
  function updateVrCamera(dt){
    cameraCooldown=Math.max(0,cameraCooldown-dt);
    const camHand=hands[oppositeHand(dominantHandSide())];
    if(!cameraHeld||!camHand?.grip)return;
    const wm=camHand.grip.getWorldMatrix();
    vrCameraRoot.position.copyFrom(BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(.08,.055,-.11),wm));
    vrCameraRoot.rotationQuaternion=camHand.grip.rotationQuaternion?.clone()||BABYLON.Quaternion.Identity();
  }
  function takeGamePhoto(){
    if(!cameraHeld||cameraCooldown>0)return;
    cameraCooldown=.8;playImpactSound("metal",.35);
    let ok=false;
    try{ok=captureWithContentCamera();}catch(_){}
    if(!ok){
      try{
        const canvas=engine.getRenderingCanvas(),data=canvas.toDataURL("image/png");
        const a=document.createElement("a");a.href=data;a.download=`potato-brawl-${Date.now()}.png`;
        document.body.appendChild(a);a.click();a.remove();
      }catch(_){}
    }
    lastLobbyMessage=`Photo • ${gameState.settings.cameraMode} • ${gameState.settings.cameraAspect}`;
    if(gameMode==="lobby")refreshLobby();
  }


  // ------------------------------------------------------------
  // Multiplayer-ready local state
  // Actual remote sync is intentionally backend-dependent.
  // ------------------------------------------------------------
  let playerDowned=false,downedTimer=0,lastPing=null,lastEmote=null;

  function enterDownedState(){
    if(gameState.partySize<=1)return false;
    playerDowned=true;downedTimer=18;playerDead=false;playerHP=1;playerInvuln=.6;
    bodyVelocity.set(0,0,0);
    return true;
  }
  function reviveLocalPlayer(){
    playerDowned=false;downedTimer=0;playerHP=Math.round(PLAYER_MAX_HP*.45);playerInvuln=1.2;updatePlayerHud();
  }
  function updateDownedCrawling(dt){
    if(!playerDowned)return;
    downedTimer-=dt;
    updatePlayerHud();
    // Existing hand locomotion remains available but vertical momentum is heavily limited.
    bodyVelocity.y=Math.min(bodyVelocity.y,.05);
    bodyVelocity.x*=Math.pow(.65,dt);
    bodyVelocity.z*=Math.pow(.65,dt);
    if(downedTimer<=0){
      playerDowned=false;playerHP=0;playerDead=true;deathTimer=3;
      if(isInXR()){
        deathPlane.setEnabled(true);
        hudPlane.setEnabled(false);
      }
      chestRoot.setEnabled(false);
    }
  }
  function pingWorld(pos){lastPing={pos:pos.clone(),time:performance.now()};}
  function playEmote(name){lastEmote={name,time:performance.now()};}

  // ------------------------------------------------------------
  // XR
  // ------------------------------------------------------------
  const lobbyPrev={trigger:false,grip:false,menu:false,camera:false,stick:false};
  const btn=(h,i)=>!!h?.controller?.inputSource?.gamepad?.buttons?.[i]?.pressed;
  function updateLobbyControls(){
    if(!xrCamera)return;
    const dom=hands[dominantHandSide()];
    const mh=menuHand();
    const trigger=btn(dom,0);
    const grip=btn(dom,1);
    const menu=btn(mh,5);
    const cameraBtn=btn(dom,5);
    const gp=dom?.controller?.inputSource?.gamepad;
    const sy=gp?.axes?.length?gp.axes[gp.axes.length-1]||0:0;

    if(Math.abs(sy)>.62&&!lobbyPrev.stick){
      lobbyPrev.stick=true;
      const d=sy>0?1:-1;
      if(quickMenuOpen)quickMenuIndex=wrap(quickMenuIndex+d,quickMenuCount());
      else if(gameState.pendingDuplicate)lobbyIndex=wrap(lobbyIndex+d,3);
      else if(lobbySub==="main")lobbySelection=wrap(lobbySelection+d,lobbyMenu.length);
      else if(lobbySub==="maps")lobbyIndex=wrap(lobbyIndex+d,Math.max(1,ownedMapIds().length));
      else if(lobbySub==="bats")lobbyIndex=wrap(lobbyIndex+d,Math.max(1,ownedBatIds().length));
      else if(lobbySub==="skins")lobbyIndex=wrap(lobbyIndex+d,Math.max(1,ownedSkinIds().length));
      else if(lobbySub==="cosmetics")lobbyIndex=wrap(lobbyIndex+d,COSMETIC_CATALOG.length);
      else if(lobbySub==="owner")lobbyIndex=wrap(lobbyIndex+d,OWNER_COSMETIC_IDS.length);
      else if(lobbySub==="colors")lobbyIndex=wrap(lobbyIndex+d,3);
      else if(lobbySub==="bundles")lobbyIndex=wrap(lobbyIndex+d,BUNDLES.length);
      else if(lobbySub==="gemshop")lobbyIndex=wrap(lobbyIndex+d,GEM_PACKS.length);
      else if(lobbySub==="settings")lobbyIndex=wrap(lobbyIndex+d,5);
      else if(lobbySub==="controls")lobbyIndex=wrap(lobbyIndex+d,3);
      else if(lobbySub==="prematch")lobbyIndex=wrap(lobbyIndex+d,4);
      else if(lobbySub==="avatar"||lobbySub==="inspect"||lobbySub==="practice"||lobbySub==="difficulty"||lobbySub==="calibration"||lobbySub==="holster"||lobbySub==="testmode")lobbyIndex=0;
      else if(lobbySub==="multi")lobbyIndex=wrap(lobbyIndex+d,networkLobbyItemCount());
      refreshLobby();
    }else if(Math.abs(sy)<.3)lobbyPrev.stick=false;

    if(menu&&!lobbyPrev.menu)toggleQuickMenu();
    if(cameraBtn&&!lobbyPrev.camera&&cameraHeld&&!quickMenuOpen)takeGamePhoto();

    if(quickMenuOpen){
      if(trigger&&!lobbyPrev.trigger)activateQuickMenu();
    }else if(gameMode==="lobby"){
      if(trigger&&!lobbyPrev.trigger)activateLobby();
      if(grip&&!lobbyPrev.grip)backLobby();
    }

    lobbyPrev.trigger=trigger;lobbyPrev.grip=grip;lobbyPrev.menu=menu;lobbyPrev.camera=cameraBtn;
  }

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
          if (side===batHandSide() && h.node) {
            attachBatToSelectedHand();
          }
        };
        c.onMotionControllerInitObservable.add(mc=>{
          hook();
          if(side===menuHandSide()){
            for(const id of ["menu-button","xr-standard-menu","menu","system","y-button"]){
              try{
                const comp=mc.getComponent?.(id);
                if(comp?.onButtonStateChangedObservable)comp.onButtonStateChangedObservable.add(()=>{
                  if(comp.changes?.pressed&&comp.pressed)toggleQuickMenu();
                });
              }catch(_){}
            }
          }
        });
        hook();
      });

      xr.input.onControllerRemovedObservable.add(c=>{
        const side=c.inputSource.handedness;
        if (!hands[side]) return;
        const h=hands[side];
        h.controller=null;h.node=null;h.trackLast=null;
        h.contact=false;h.anchor=null;h.normal=null;h.plantTrack=null;h.waitClear=false;
        h.mesh.setEnabled(false);
        if(side===batHandSide()) batRoot.setEnabled(false);
      });

      xr.baseExperience.onStateChangedObservable.add(state=>{
        if (state===BABYLON.WebXRState.IN_XR) {
          const tp=document.getElementById("testPanel");if(tp) tp.style.display="none";
          const gs=document.getElementById("gameStats");if(gs) gs.style.display="none";
          attachHud();
          updatePlayerHud();
          chestRoot.setEnabled(true);
          startBackgroundMusic();
          goLobby(true);
          bodyVelocity.set(0,0,0);
          batTipLast=null;
          batBaseLast=null;
          for(const side of ["left","right"]) {
            hands[side].trackLast=null;
            hands[side].contact=false;
            hands[side].waitClear=false;
          }
        }else if(state===BABYLON.WebXRState.NOT_IN_XR){
          const tp=document.getElementById("testPanel");if(tp) tp.style.display="flex";
          const gs=document.getElementById("gameStats");if(gs) gs.style.display="block";
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
    groundSlamCooldown=Math.max(0,groundSlamCooldown-dt);
    updateLocalVoiceFace(dt);
    updateOwnerGift(dt);
    
    batHitCooldown=Math.max(0,batHitCooldown-dt);
    playerInvuln=Math.max(0,playerInvuln-dt);

    if (damageFlashTimer>0) {
      damageFlashTimer-=dt;
      if (damageFlashTimer<=0) damageFlash.setEnabled(false);
    }

    if(blockFlashTimer>0){
      blockFlashTimer-=dt;
      if(blockFlashTimer<=0) blockPlane.setEnabled(false);
    }

    if (playerDead) {
      deathTimer-=dt;
      if (deathTimer<=0) {
        if(gameState.mode==="HARDCORE") {
          respawnPlayer();
          goLobby();
          lastLobbyMessage="HARDCORE RUN ENDED";
          refreshLobby();
        } else {
          respawnPlayer();
        }
      }
    }

    // NPC
    if (npc && !(net.connected&&!net.isHost)) {
      npc.hitCooldown=Math.max(0,npc.hitCooldown-dt);
      npc.hpFlashTimer=Math.max(0,npc.hpFlashTimer-dt);
      updateNpcLabel();
      npc.attackCooldown=Math.max(0,npc.attackCooldown-dt);
      npc.pickupCooldown=Math.max(0,(npc.pickupCooldown||0)-dt);
      if(
        npc.weaponBroken &&
        gameMode==="map" &&
        !npc.dead &&
        !npc.recovering
      ) npcPickupMapWeapon();
      npc.throwCooldown=Math.max(0,npc.throwCooldown-dt);
      npc.attackAnim=Math.max(0,npc.attackAnim-dt);
      npc.recentlyHit=Math.max(0,npc.recentlyHit-dt);
      npc.reactionCooldown=Math.max(0,npc.reactionCooldown-dt);
      npc.reactionTimer=Math.max(0,npc.reactionTimer-dt);
      if (npc.reactionTimer<=0) npc.speech.plane.setEnabled(false);

      if (!npc.dead) {
        npc.statusBurn=Math.max(0,(npc.statusBurn||0)-dt);
        npc.statusPoison=Math.max(0,(npc.statusPoison||0)-dt);
        npc.statusSlow=Math.max(0,(npc.statusSlow||0)-dt);
        npc.statusTick=(npc.statusTick||0)-dt;
        if(npc.statusTick<=0&&(npc.statusBurn>0||npc.statusPoison>0)){npc.statusTick=.55;applyDirectNpcDamage((npc.statusBurn>0?2:0)+(npc.statusPoison>0?1:0));if(npc.hpValue<=0){finishNpc(npcLocalToWorld(npc.ragdoll.points.chest.pos),new BABYLON.Vector3(0,.2,1.8),2.2);}}
        setNpcMaterial();
        updateNpcFace(dt);
        npc.stun=Math.max(0,npc.stun-dt);

        if(!npc.recovering && npc.stun<=0 && npcIsDown()){
          startNpcRecovery();
        }

        if(npc.recovering){
          npc.recoverTimer=Math.max(0,npc.recoverTimer-dt);
          npc.walkingNow=false;
          npc.attackAnim=0;

          // No sideways travel while getting up.
          npc.velocity.x*=Math.pow(.015,dt);
          npc.velocity.z*=Math.pow(.015,dt);

          // Remove the leftover X/Z spin that made him walk while tilted.
          const uprightBlend=1-Math.exp(-dt*8.5);
          npc.root.rotation.x=BABYLON.Scalar.Lerp(
            npc.root.rotation.x,0,uprightBlend
          );
          npc.root.rotation.z=BABYLON.Scalar.Lerp(
            npc.root.rotation.z,0,uprightBlend
          );
          npc.angular.x*=Math.pow(.02,dt);
          npc.angular.z*=Math.pow(.02,dt);

          updateNpcRagdoll(dt,true);

          // He must be genuinely upright for a while, not merely "not down".
          if(npcIsFullyUpright()){
            npc.recoverStableTimer+=dt;
          }else{
            npc.recoverStableTimer=0;
          }

          if(
            npc.recoverTimer<=0 &&
            npc.recoverStableTimer>.34
          ){
            npc.root.rotation.x=0;
            npc.root.rotation.z=0;
            npc.angular.x=0;
            npc.angular.z=0;
            npc.recovering=false;
            npc.attackCooldown=Math.max(npc.attackCooldown,.70);
          }
        }


        npc.velocity.y+=NPC_GRAVITY*dt;
        moveNpc(npc.velocity.scale(dt));
        npc.velocity.x*=Math.pow(.10,dt);
        npc.velocity.z*=Math.pow(.10,dt);

        if (!npc.recovering && isInXR() && !playerDead && gameMode==="map") {
          const combatTarget=npcCombatTarget()||{
            id:"none",local:false,
            pos:npc.root.position.add(new BABYLON.Vector3(0,0,99)),
            head:npc.root.position.add(new BABYLON.Vector3(0,1.6,99)),
            chest:npc.root.position.add(new BABYLON.Vector3(0,1.2,99))
          };
          const playerPos=combatTarget.pos.clone();
          npc.proximityReactCooldown=Math.max(0,(npc.proximityReactCooldown||0)-dt);
          const toPlayer=playerPos.subtract(npc.root.position);
          if(toPlayer.length()<1.35&&npc.proximityReactCooldown<=0){reactNpc("near",1);npc.proximityReactCooldown=2.2+Math.random()*1.8;}
          toPlayer.y=0;
          const d=toPlayer.length();
          let walking=false;

          if (!npc.greeted && d<5.5) {
            npc.greeted=true;
            speakNpc("chase",false);
          }

          // Even when scared, NPC never runs away. Fear only changes voice,
          // speed and hesitation.
          if (
            npc.stun<=0 &&
            npc.attackAnim<=0 &&
            npcIsFullyUpright() &&
            d>1.35 && d<10
          ) {
            walking=true;
            const dir=toPlayer.normalize();
            npc.root.rotation.y=Math.atan2(dir.x,dir.z);

            let speed=npc.archetype?.speed || 1.30;
            if (npc.emotion==="angry") speed=1.72;
            if (npc.emotion==="scared") speed=1.18;

            const legDamage=Math.max(npc.injuries.leftLeg,npc.injuries.rightLeg);
            speed*=BABYLON.Scalar.Clamp(1-legDamage*.0042,.57,1);

            moveNpc(dir.scale(speed*dt));

            if (npc.reactionCooldown<=0 && Math.random()<.014) {
              speakNpc(
                npc.emotion==="angry"
                  ? (npc.anger>=55 ? "furious" : "angry")
                  : npc.emotion==="scared" ? "scared" : "chase"
              );
            }
          }

          // If he is very angry and you stay farther away, he may throw
          // a nearby small office object instead of only chasing.
          if(
            npc.anger>=68 &&
            npcIsFullyUpright() &&
            d>2.25 && d<5.3 &&
            npc.throwCooldown<=0 &&
            npc.stun<=0 &&
            npc.attackAnim<=0
          ){
            if(npcThrowNearbyObject(playerPos)){
              npc.throwCooldown=(3.2+Math.random()*1.8)/(npc.archetype?.throwRate||1);
              npc.attackCooldown=.55;
            }else{
              npc.throwCooldown=1.2;
            }
          }

          // Start a real weapon swing, but distance alone does NOT deal damage.
          if (
            d<=2.55 &&
            npcIsFullyUpright() &&
            npc.stun<=0 &&
            npc.attackAnim<=0 &&
            npc.attackCooldown<=0 &&
            !npc.weaponBroken &&
            npc.weaponRoot.isEnabled()
          ) {
            const armPenalty=BABYLON.Scalar.Clamp(npc.injuries.rightArm/100,0,.7);
            npc.attackCooldown=(npc.archetype?.attackRate ?? .38)+armPenalty*.42;
            npc.attackAnim=npc.attackDuration*(1+armPenalty*.34);
            npc.attackHasHit=false;
            npc.attackBlocked=false;
            npc.weaponPrevBase=npc.weaponBase.getAbsolutePosition().clone();
            npc.weaponPrevTip=npc.weaponTip.getAbsolutePosition().clone();
            speakNpc(npc.anger>=60 && Math.random()<.45 ? "furious" : "attack",false);
            playImpactSound("whoosh",.55);
          }

          // Animate a weapon swing that continuously aims at the player's
          // CURRENT position, not just straight forward.
          if (npc.attackAnim>0) {
            const progress=1-(npc.attackAnim/npc.attackDuration);
            npc.attackAnim=Math.max(0,npc.attackAnim-dt);

            // Turn toward the player during the entire swing.
            const liveCombatTarget=npcCombatTarget()||combatTarget;
            const liveTarget=liveCombatTarget.pos.subtract(npc.root.position);
            liveTarget.y=0;

            if(liveTarget.lengthSquared()>.001){
              liveTarget.normalize();
              const desiredYaw=Math.atan2(liveTarget.x,liveTarget.z);

              let deltaYaw=desiredYaw-npc.root.rotation.y;
              deltaYaw=Math.atan2(Math.sin(deltaYaw),Math.cos(deltaYaw));
              npc.root.rotation.y+=deltaYaw*Math.min(1,dt*30);
            }

            // Aim weapon height toward current chest/head height.
            const playerSpheres=combatTargetSpheres(liveCombatTarget);
            const targetSphere=playerSpheres[1] || playerSpheres[0];
            const targetWorld=(targetSphere?.center || liveCombatTarget.pos).clone();
            const weaponWorld=npc.weaponRoot.getAbsolutePosition();
            const aim=targetWorld.subtract(weaponWorld);

            const horizontal=Math.max(.001,Math.hypot(aim.x,aim.z));
            const pitchToPlayer=Math.atan2(aim.y,horizontal);

            // Windup -> fast strike -> followthrough, but centered on the
            // live pitch toward the player's body.
            let swingOffset;
            if(progress<.25){
              swingOffset=BABYLON.Scalar.Lerp(-1.12,-1.62,progress/.25);
            } else if(progress<.72){
              swingOffset=BABYLON.Scalar.Lerp(-1.62,.18,(progress-.25)/.47);
            } else {
              swingOffset=BABYLON.Scalar.Lerp(.18,.62,(progress-.72)/.28);
            }

            npc.weaponRoot.rotation.x=pitchToPlayer+swingOffset;

            // Side angle bends the swing toward player's horizontal location.
            const localSide=BABYLON.Scalar.Clamp(
              liveTarget.x*Math.cos(npc.root.rotation.y) -
              liveTarget.z*Math.sin(npc.root.rotation.y),
              -1,1
            );
            npc.weaponRoot.rotation.y=localSide*.78;

            const base=npc.weaponBase.getAbsolutePosition().clone();
            const mid=npc.weaponMid.getAbsolutePosition().clone();
            const tip=npc.weaponTip.getAbsolutePosition().clone();

            const prevBase=npc.weaponPrevBase||base;
            const prev=npc.weaponPrevTip||tip;

            npc.weaponPrevBase=base.clone();
            npc.weaponPrevTip=tip.clone();

            // Multiplayer guest block attempt. Host validates the fresh guest bat pose.
            if(net.connected&&!net.isHost&&!batHolstered&&batRoot.isEnabled()&&npc.netTargetId===net.playerId&&!npc.attackBlocked&&!npc.attackHasHit){
              const bb=batBase(),bt=batTip();
              const remoteBlockDist=segmentSegmentDistance(base,tip,bb,bt);
              if(remoteBlockDist<.23&&progress>.16&&progress<.95&&(net.blockCooldown||0)<=0){
                net.blockCooldown=.18;
                sendHost({t:"block"});
              }
            }

            // Full-weapon blocking:
            // handle/base, middle, shaft and tip can ALL be blocked.
            if (!npc.attackBlocked && liveCombatTarget.local && batRoot.isEnabled() && !batHolstered) {
              const bb=batBase();
              const bt=batTip();

              const prevBb=batBaseLast || bb;
              const prevBt=batTipLast || bt;

              const dShaftNow=segmentSegmentDistance(base,tip,bb,bt);
              const dShaftPrev=segmentSegmentDistance(prevBase,prev,prevBb,prevBt);

              const dBaseSweep=segmentSegmentDistance(prevBase,base,bb,bt);
              const dTipSweep=segmentSegmentDistance(prev,tip,bb,bt);

              const dHandle=Math.min(
                pointSegmentDistance(base,bb,bt),
                pointSegmentDistance(prevBase,bb,bt),
                pointSegmentDistance(mid,bb,bt)
              );

              const blockDist=Math.min(
                dShaftNow,dShaftPrev,dBaseSweep,dTipSweep,dHandle
              );

              // Earlier and slightly more forgiving full-shaft block window.
              if(blockDist<.205 && progress>.16 && progress<.95){
                npc.attackBlocked=true;
                npc.attackHasHit=true;
                npc.attackAnim=0;
                npc.stun=.62;
                const blockBatSpeed=(prevBt&&bt)?BABYLON.Vector3.Distance(prevBt,bt)/Math.max(dt,.008):2.5;
                npc.weaponDurability=Math.max(0,(npc.weaponDurability||1)-(blockBatSpeed>5.2?3:blockBatSpeed>3?2:1));
                if(npc.weaponDurability<=0)breakNpcWeapon();

                let push=npc.root.position.subtract(liveCombatTarget.pos);
                push.y=0;
                if(push.lengthSquared()<.001) push.set(0,0,1);
                push.normalize();

                npc.velocity.addInPlace(push.scale(1.45));

                // Strong feedback so the player knows it was a successful block.
                pulse(batHand(),1,135);
                pulse(supportHand(),.35,55);
                playImpactSound("block",1);
                recordBlock();

                npc.anger=Math.min(100,npc.anger+14);
                reactNpc("block",1);speakNpc("block",false);
              }
            }

            // Real full-weapon hitbox against head/chest.
            if (!npc.attackBlocked && !npc.attackHasHit && progress>.34) {
              const hit=combatTargetSpheres(liveCombatTarget).some(s=>{
                const tipSweep=segmentSphereHit(prev,tip,s.center,s.radius+.12);
                const shaftNow=pointSegmentDistance(s.center,base,tip)<=s.radius+.105;
                const shaftPrev=pointSegmentDistance(s.center,prevBase,prev)<=s.radius+.105;
                return tipSweep || shaftNow || shaftPrev;
              });

              if(hit){
                npc.attackHasHit=true;
                const armWeak=BABYLON.Scalar.Clamp(1-npc.injuries.rightArm*.004,.62,1);
                const dm=npcDifficultyMul();const attackDamage=Math.max(1,Math.round(npc.weaponCfg.damage*(npc.archetype?.attackMul||1)*armWeak*1.08*dm.damage));
                damageCombatTarget(liveCombatTarget,attackDamage,npc.root.position);

                if(liveCombatTarget.local){
                  let away=liveCombatTarget.pos.subtract(npc.root.position);
                  away.y=0;
                  if(away.lengthSquared()<.001) away.set(0,0,-1);
                  away.normalize();
                  bodyVelocity.addInPlace(
                    away.scale(npc.weaponCfg.knockback*(npc.archetype?.knockbackMul||1)*.62)
                      .add(new BABYLON.Vector3(0,.38,0))
                  );
                }
              }
            }

          } else {
            npc.weaponRoot.rotation.x=.10;
            npc.weaponRoot.rotation.y=0;
          }

          // Hard off-center hits can spin the standing NPC too.
        npc.root.rotation.x+=npc.angular.x*dt;
        npc.root.rotation.y+=npc.angular.y*dt;
        npc.root.rotation.z+=npc.angular.z*dt;
        npc.angular.scaleInPlace(Math.pow(.16,dt));

        // If a hard hit left him meaningfully tilted, force a get-up cycle
        // before walking again.
        if(
          !npc.recovering &&
          npc.stun<=0 &&
          (
            Math.abs(npc.root.rotation.x)>.13 ||
            Math.abs(npc.root.rotation.z)>.13 ||
            !npcIsFullyUpright()
          )
        ){
          startNpcRecovery();
          walking=false;
        }

        npc.walkingNow=walking;
          if(walking){
            npc.walkPhase+=dt*8.5;
            const stepIndex=Math.floor(npc.walkPhase/Math.PI);
            if(stepIndex!==npc.lastStepIndex){
              npc.lastStepIndex=stepIndex;
              playImpactSound("step",.55);
            }
          }

          // The active ragdoll produces walking/arm motion physically.
          if(!npc.recovering) updateNpcRagdoll(dt,true);
        } else if(!npc.recovering) {
          npc.walkingNow=false;
          updateNpcRagdoll(dt,true);
        }
      } else {
        npc.respawnTimer-=dt;
        npc.deathTotalTimer+=dt;
        npc.walkingNow=false;

        if(npc.deathPhase!=="settled"){
          npc.velocity.y-=2.8*dt;

          const deadSpeed=npc.velocity.length();
          if(deadSpeed>4.2){
            npc.velocity.normalize().scaleInPlace(4.2);
          }

          moveNpc(npc.velocity.scale(dt));

          npc.angular.x=BABYLON.Scalar.Clamp(npc.angular.x,-2.2,2.2);
          npc.angular.y=BABYLON.Scalar.Clamp(npc.angular.y,-2.2,2.2);
          npc.angular.z=BABYLON.Scalar.Clamp(npc.angular.z,-2.2,2.2);

          npc.root.rotation.x+=npc.angular.x*dt;
          npc.root.rotation.y+=npc.angular.y*dt;
          npc.root.rotation.z+=npc.angular.z*dt;
        }

        npc.velocity.x*=Math.pow(.34,dt);
        npc.velocity.z*=Math.pow(.34,dt);
        npc.angular.scaleInPlace(Math.pow(.18,dt));

        if(npc.deathPhase==="stagger"){
          npc.deathTimer-=dt;
          updateNpcRagdoll(dt,true);

          if(npc.deathTimer<=0){
            npc.deathPhase="collapse";
            npc.deathTimer=1.05;
            npc.ragdoll.dead=true;
            npc.hp.plane.setEnabled(false);
            // Weapon stays visible through the first part of the collapse.
            npc.weaponRoot.setEnabled(true);
          }
        }else if(npc.deathPhase==="collapse"){
          npc.deathTimer-=dt;

          // One connected ragdoll only, with a longer readable KO collapse.
          if(npc.deathTimer>0){
            updateNpcRagdoll(dt,false);
          }else{
            npc.deathPhase="settled";
            npc.deathExploded=true;
            npc.weaponRoot.setEnabled(false);
            npc.velocity.set(0,0,0);
            npc.angular.set(0,0,0);

            // Freeze Verlet velocity so the body stops jittering.
            for(const p of npc.ragdoll.list){
              p.prev.copyFrom(p.pos);
            }
          }
        }else if(npc.deathPhase==="settled"){
          // Keep the final ragdoll pose frozen until respawn.
          npc.velocity.set(0,0,0);
          npc.angular.set(0,0,0);
        }

        if (npc.respawnTimer<=0) {
          npc.root.dispose();
          createNpc();configureNpcForCurrentLevel();
          npc.root.position.copyFrom(getNpcSpawnPosition());
          if(gameMode==="lobby")npc.root.setEnabled(false);
        }

      }
    }

    // Detached death parts after the finishing explosion.
    // They now settle and sleep instead of jittering forever.
    for(let i=deathParts.length-1;i>=0;i--){
      const r=deathParts[i];
      r.life-=dt;
      r.age+=dt;

      if(!r.sleeping){
        r.vel.y-=4.1*dt;

        // Extra substeps reduce tunnelling through desks/walls/floor.
        moveDeathPart(r,dt);

        r.mesh.rotation.x+=r.spin.x*dt;
        r.mesh.rotation.y+=r.spin.y*dt;
        r.mesh.rotation.z+=r.spin.z*dt;

        r.vel.x*=Math.pow(.24,dt);
        r.vel.z*=Math.pow(.24,dt);
        r.spin.scaleInPlace(Math.pow(.09,dt));

        const motion=r.vel.length()+r.spin.length()*.06;
        if(r.age>.65 && motion<.32){
          r.sleepTimer+=dt;
          if(r.sleepTimer>.20){
            r.sleeping=true;
            r.vel.set(0,0,0);
            r.spin.set(0,0,0);
          }
        }else{
          r.sleepTimer=0;
        }
      }

      if(r.life<=0 || r.mesh.position.y<-5.4){
        r.mesh.dispose();
        deathParts.splice(i,1);
      }
    }


    if(npc && net.connected && !net.isHost)updateNpcFace(dt);
    updateNpcSlap(dt);
    updatePack2(dt);quickMenuDebounce=Math.max(0,quickMenuDebounce-dt);updateRemoteAvatars(dt);updateNetworking();updateLobbyControls();updateVrCamera(dt);updateContentCamera(dt);updateAdvancedCombatInput(dt);updateThrownBat(dt);updateMapSystems(dt);updateDownedCrawling(dt);updateAdaptiveNpc();if(quickMenuOpen)placeQuickMenu();
    updateExtraNpcs(dt);
    updateOfficePhysics(dt);

    // XR player / hands / bat
    if (xrCamera && xr?.baseExperience?.state===BABYLON.WebXRState.IN_XR) {
      if (!playerDead) {
        for (const side of ["left","right"]) {
          const h=hands[side];
          if (!h.node) continue;
          const wp=calibratedHandWorld(h),tp=handTrack(h);
          if (!wp||!tp) continue;

          updateHandLocomotion(h,wp,tp,dt);
          h.mesh.rotationQuaternion=h.node.absoluteRotationQuaternion?.clone()||BABYLON.Quaternion.Identity();
        }

        updateMultiplayerSlaps(dt);
        const planted=hands.left.contact||hands.right.contact;

        // Normal gravity with retained air momentum.
        if (!planted) bodyVelocity.y+=PLAYER_GRAVITY*dt;
        else if (bodyVelocity.y<0) bodyVelocity.y=0;

        // Knockback/momentum always applies, including while hands are raised.
        xrCamera.position.addInPlace(bodyVelocity.scale(dt));

        const drag=planted?.13:.52;
        bodyVelocity.x*=Math.pow(drag,dt);
        bodyVelocity.z*=Math.pow(drag,dt);
        bodyVelocity.y*=Math.pow(.78,dt);

        if (bodyVelocity.length()>MAX_PLAYER_SPEED)
          bodyVelocity=bodyVelocity.normalize().scale(MAX_PLAYER_SPEED);

        keepRigAboveFloor();
        resolvePlayerWorldCollision();
        if(gameState.selectedMap==="office"){
          xrCamera.position.x=Math.max(-10.85,Math.min(10.85,xrCamera.position.x));
          xrCamera.position.z=Math.max(-19.05,Math.min(3.65,xrCamera.position.z));
        }else{
          xrCamera.position.x=Math.max(RUNTIME_CENTER.x-8.65,Math.min(RUNTIME_CENTER.x+8.65,xrCamera.position.x));
          xrCamera.position.z=Math.max(RUNTIME_CENTER.z-8.65,Math.min(RUNTIME_CENTER.z+8.65,xrCamera.position.z));
        }
        xrCamera.position.y=Math.min(4.2,xrCamera.position.y);

        updateBodyVisual(dt);

        if(batHolstered){batTipLast=null;batBaseLast=null;}
        if (batRoot.isEnabled() && !batHolstered) {
          const tip=batTip();
          if (batTipLast) {
            const vel=tip.subtract(batTipLast).scale(1/Math.max(dt,.008));
            lastBatWorldVel.copyFrom(vel);
            const speed=vel.length();

            // Office objects and windows use the entire swept bat path.
            handleBatOfficeHit(batTipLast,tip,vel,speed);

            if(speed>.28 && batHitCooldown<=0){
              if(gameMode==="lobby"&&lobbySub==="practice"){
                if(hitPracticeDummySweep(batTipLast,tip,batBase(),speed))batHitCooldown=.12;
              }

              const npcHit=npcBatSweepHit(
                batTipLast,
                tip,
                batBase(),
                .255
              );

              if(npcHit){
                batHitCooldown=.12;
                damageNpc(npcHit.point,vel,speed);
              }else if(!(net.connected&&!net.isHost)){
                const extraHit=hitExtraNpcSweep(
                  batTipLast,
                  tip,
                  batBase(),
                  .255
                );
                if(extraHit){
                  batHitCooldown=.12;
                  damageExtraNpc(extraHit,vel,speed);
                }
              }
            }

            const wc=surfaceContact(tip,.11);
            if (wc && speed>1.7 && batHitCooldown<=0) {
              batHitCooldown=.12;
              pulse(batHand(),Math.min(.85,.18+speed*.055),25+Math.min(50,speed*3));
              simpleHitSound(false);
            }
          }
          batBaseLast=batBase().clone();
          batTipLast=tip.clone();
        }
      } else {
        chestRoot.setEnabled(false);
      }
    }
  });

  function npcThrowNearbyObject(playerPos){
    if(!npc || npc.dead) return false;

    const candidates=officeProps.filter(p=>
      !p.broken &&
      ["mug","keyboard","mouse","pencup","stapler","bin","plant","chair"].includes(p.type) &&
      BABYLON.Vector3.Distance(
        p.root.getAbsolutePosition?.() || p.root.position,
        npc.root.position
      )<2.2
    );

    if(!candidates.length) return false;

    const prop=candidates[Math.floor(Math.random()*candidates.length)];
    const pos=prop.root.getAbsolutePosition?.() || prop.root.position;

    let dir=playerPos.subtract(pos);
    if(dir.lengthSquared()<.001) dir.set(0,.1,1);
    dir.normalize();

    prop.loose=true;
    prop.sleepTimer=0;
    prop.vel.copyFrom(dir.scale(5.2).add(new BABYLON.Vector3(0,1.8,0)));
    prop.ang.set(
      (Math.random()-.5)*8,
      (Math.random()-.5)*8,
      (Math.random()-.5)*8
    );

    speakNpc("furious",false);
    playImpactSound("whoosh",.6);
    return true;
  }

  // ------------------------------------------------------------
  // Lightweight extra NPCs
  // Primary NPC keeps full active-ragdoll physics.
  // Two extras use lighter physics so Quest 2 can keep a stable framerate.
  // ------------------------------------------------------------
  const extraNpcs=[];

  function makeExtraNpc(index){
    const a=NPC_ARCHETYPES[(index+2)%NPC_ARCHETYPES.length];
    const root=new BABYLON.TransformNode("extraNpcRoot"+index,scene);
    root.position.set(index===0?-4.0:4.0,0,-6.5-index*2.4);

    const skin=mkMat("extraSkin"+index,index===0?"#d7a07c":"#b77d5d");
    const shirt=mkMat("extraShirt"+index,index===0?"#657d57":"#6f587d");
    const pants=mkMat("extraPants"+index,"#34404e");
    const hairM=mkMat("extraHair"+index,index===0?"#281e18":"#3a2b22");

    skin.emissiveColor=skin.diffuseColor.scale(.045);
    shirt.emissiveColor=shirt.diffuseColor.scale(.02);

    const body=BABYLON.MeshBuilder.CreateCapsule("extraBody"+index,{
      height:1.05,radius:.23,tessellation:16
    },scene);
    body.parent=root;body.position.y=.96;body.material=shirt;

    const head=BABYLON.MeshBuilder.CreateCapsule("extraHead"+index,{
      height:.39,radius:.17,tessellation:18
    },scene);
    head.parent=root;head.position.y=1.68;head.material=skin;

    const hair=BABYLON.MeshBuilder.CreateSphere("extraHair"+index,{
      diameter:.36,segments:14
    },scene);
    hair.parent=head;
    hair.position.set(0,.11,-.035);
    hair.material=hairM;
    hair.scaling.set(
      index===0?.80:.70,
      index===0?.30:.45,
      .84
    );

    const eyeWhite=mkMat("extraEyeWhite"+index,"#f4f4f1");
    const pupil=mkMat("extraPupil"+index,"#111111");
    for(const sx of [-1,1]){
      const e=BABYLON.MeshBuilder.CreateSphere("extraEye"+index+sx,{
        diameter:.045,segments:8
      },scene);
      e.parent=head;e.position.set(sx*.065,.04,.166);e.material=eyeWhite;
      const p=BABYLON.MeshBuilder.CreateSphere("extraPupil"+index+sx,{
        diameter:.014,segments:6
      },scene);
      p.parent=head;p.position.set(sx*.065,.04,.184);p.material=pupil;
    }

    const hp=hpLabel(root);
    hp.plane.position.y=2.12;

    const e={
      root,body,head,hair,hp,
      typeName:a.name,
      archetype:a,
      hpValue:a.maxHp,
      maxHp:a.maxHp,
      dead:false,
      cooldown:.8+Math.random(),
      velocity:new BABYLON.Vector3(),
      respawn:0,
      hitFlash:0
    };

    extraNpcs.push(e);
    return e;
  }

  // v0.24.1 stability: extra NPC spawns disabled to avoid low-quality/glitchy NPCs.
  makeExtraNpc(0);makeExtraNpc(1);
  extraNpcs.forEach(e=>e.root.setEnabled(false));

  function configureExtraSquad(){
    const p=currentMapProgress();
    const multiplayerActive=net.isHost||net.connected||gameState.partySize>1;
    const count=multiplayerActive?0:(p.level>=7?2:p.level>=4?1:0);
    const center=gameState.selectedMap==="office"?new BABYLON.Vector3(0,0,-6):RUNTIME_CENTER;
    extraNpcs.forEach((e,i)=>{
      const on=i<count && p.level<10;
      e.root.setEnabled(on);
      if(on){
        e.dead=false;e.hpValue=e.maxHp;e.velocity.set(0,0,0);
        e.root.position.set(center.x+(i===0?-3.5:3.5),0,center.z-2.6-i*.9);
        e.root.scaling.set(1,1,1);
        e.hp.plane.setEnabled(true);e.body.setEnabled(true);e.head.setEnabled(true);e.hair.setEnabled(true);
        if(e.weapon)e.weapon.setEnabled(true);
      }
    });
  }


  function updateExtraNpcLabel(e){
    const hp=Math.max(0,Math.ceil(e.hpValue));
    e.hp.text.text=`${e.typeName} • ${hp}/${e.maxHp} HP`;
    e.hp.bar.width=`${Math.max(.01,hp/e.maxHp)*100}%`;
    e.hp.bar.background=e.hitFlash>0?"#ef4444":"#22c55e";
  }

  function hitExtraNpcSweep(prevTip,tip,base,radius=.25){
    let best=null;
    let bestD=Infinity;

    for(const e of extraNpcs){
      if(e.dead) continue;

      const points=[
        e.root.position.add(new BABYLON.Vector3(0,1.68,0)),
        e.root.position.add(new BABYLON.Vector3(0,1.15,0)),
        e.root.position.add(new BABYLON.Vector3(0,.72,0))
      ];

      for(const w of points){
        const d=Math.min(
          pointSegmentDistance(w,prevTip,tip),
          pointSegmentDistance(w,base,tip)
        );

        if(d<radius+.22 && d<bestD){
          bestD=d;
          best={npc:e,point:w.clone()};
        }
      }
    }

    return best;
  }

  function damageExtraNpc(hit,swingVel,speed){
    const e=hit.npc;
    if(!e || e.dead) return;

    const dmg=Math.max(1,swingDamage(speed));
    e.hpValue-=dmg;
    e.hitFlash=.16;

    let dir=swingVel.clone();
    if(dir.lengthSquared()<.001) dir.set(0,.15,1);
    dir.normalize();

    e.velocity.addInPlace(
      dir.scale(.28+speed*.13)
        .add(new BABYLON.Vector3(0,.12,0))
    );

    playImpactSound("body",Math.min(1,.3+speed*.06));
    pulse(batHand(),Math.min(1,.10+speed*.10),25+Math.min(90,speed*7));

    if(e.hpValue<=0){
      e.dead=true;
      e.hpValue=0;
      e.hp.plane.setEnabled(false);
      e.respawn=5.5;

      // Clean knockout: no blood effects.
      e.body.setEnabled(false);
      e.head.setEnabled(false);
      e.hair.setEnabled(false);
    }

    updateExtraNpcLabel(e);
  }

  function updateExtraNpcs(dt){
    if(gameMode!=="map"||(net.connected&&!net.isHost))return;
    const activeAI=isInXR() && !playerDead && gameMode==="map";
    const pp=playerWorldPos();

    for(let i=0;i<extraNpcs.length;i++){
      const e=extraNpcs[i];

      if(e.dead){
        e.respawn-=dt;
        if(e.respawn<=0){
          e.dead=false;
          e.hpValue=e.maxHp;
          e.hp.plane.setEnabled(true);
          e.body.setEnabled(true);
          e.head.setEnabled(true);
          e.hair.setEnabled(true);
          {const c=gameState.selectedMap==="office"?new BABYLON.Vector3(0,0,-6):RUNTIME_CENTER;
          e.root.position.set(c.x+(i===0?-3.5:3.5),0,c.z-2.6-i*.9);}
          e.velocity.set(0,0,0);
          updateExtraNpcLabel(e);
        }
        continue;
      }

      e.hitFlash=Math.max(0,e.hitFlash-dt);
      e.cooldown=Math.max(0,e.cooldown-dt);
      updateExtraNpcLabel(e);

      e.root.position.addInPlace(e.velocity.scale(dt));
      e.velocity.scaleInPlace(Math.pow(.18,dt));

      if(!activeAI) continue;

      let to=pp.subtract(e.root.position);
      to.y=0;
      const d=to.length();

      if(d>.0001){
        to.normalize();
        e.root.rotation.y=Math.atan2(to.x,to.z);
      }

      if(d>1.45 && d<12){
        const sp=(e.archetype?.speed||1.3)*.82;
        e.root.position.addInPlace(to.scale(sp*dt));
      }

      if(d<=1.65 && e.cooldown<=0){
        e.cooldown=(e.archetype?.attackRate||.45)+.55;
        const dmg=Math.max(5,Math.round(8*(e.archetype?.attackMul||1)));
        hurtPlayer(dmg,e.root.position);
        playImpactSound("body",.55);
      }
    }
  }

  // ------------------------------------------------------------
  // iPhone / desktop TEST MODE
  // ------------------------------------------------------------
  function testHit(speed){
    if(!npc || npc.dead) return;
    const targets=[
      npc.ragdoll.points.head,npc.ragdoll.points.chest,
      npc.ragdoll.points.rShoulder,npc.ragdoll.points.lKnee
    ];
    const p=targets[Math.floor(Math.random()*targets.length)];
    const hitPos=npcLocalToWorld(p.pos);
    let dir=npc.root.position.subtract(playerWorldPos());
    dir.y=.15;if(dir.lengthSquared()<.001) dir.set(0,.2,1);dir.normalize();
    damageNpc(hitPos,dir.scale(speed),speed);
  }

  function resetNpcNow(){
    if(npc?.root) npc.root.dispose();
    createNpc();configureNpcForCurrentLevel();npc.root.position=new BABYLON.Vector3(0,0,1);
    playerHP=PLAYER_MAX_HP;playerDead=false;playerInvuln=0;
    updatePlayerHud();
  }

  function breakNearestWindowTest(){
    const w=breakableWindows.find(x=>!x.metadata?.broken && x.isEnabled());
    if(w) breakWindow(w,w.getAbsolutePosition(),new BABYLON.Vector3(0,.4,4));
  }

  function smashRandomPropTest(){
    const candidates=officeProps.filter(p=>!p.broken);
    if(!candidates.length) return;
    const p=candidates[Math.floor(Math.random()*candidates.length)];
    p.hp=0;
    destroyOfficeProp(
      p,p.root.getAbsolutePosition?.()?.clone?.()||p.root.position.clone(),
      new BABYLON.Vector3((Math.random()-.5)*.4,.25,1),8
    );
  }

  function bindTestControls(){
    const panel=document.getElementById("testPanel");if(!panel) return;
    panel.addEventListener("click",e=>{
      const b=e.target.closest("button[data-test]");if(!b) return;
      try{audioCtx()?.resume?.();}catch(_){}
      const a=b.dataset.test;

      if(a==="soft") testHit(1.05);
      else if(a==="softmed") testHit(1.95);
      else if(a==="medium") testHit(2.95);
      else if(a==="medhard") testHit(4.45);
      else if(a==="hard") testHit(6.45);
      else if(a==="kill"){
        if(npc && !npc.dead){
          const p=npcLocalToWorld(npc.ragdoll.points.chest.pos);
          npc.hpValue=1;damageNpc(p,new BABYLON.Vector3(0,.6,8),8);
        }
      }else if(a==="glass") breakNearestWindowTest();
      else if(a==="prop") smashRandomPropTest();
      else if(a==="reset") resetNpcNow();
      else if(a==="ai"){
        testAIEnabled=!testAIEnabled;
        b.textContent=`AI: ${testAIEnabled?"ON":"OFF"}`;
      }
      updatePlayerHud();
    });
  }

  // VR-only: desktop combat controls intentionally disabled.
  updatePlayerHud();

  // Startup integrity test for combat.
  if(
    typeof classifyNpcHit!=="function" ||
    typeof applyInjury!=="function" ||
    typeof applyNpcSpinKnockback!=="function" ||
    typeof npcBatSweepHit!=="function"
  ){
    throw new Error("Combat helpers failed to initialize");
  }

  // Lobby-only mirror; restricted render list protects Quest performance.
  if(mirrorTex && mirror){
    mirrorTex.renderList = scene.meshes.filter(m=>m!==mirror&&(m.name?.startsWith("playerPotato")||m.name?.includes("Potato")||m.name?.startsWith("left")||m.name?.startsWith("right")||m.name?.startsWith("lobby")));
  }

  engine.runRenderLoop(()=>scene.render());
  addEventListener("resize",()=>engine.resize());
})();