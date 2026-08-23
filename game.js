(() => {
  const BUILD_VERSION="0.23.8";
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
    maxFx:320,
    maxBloodSplats:140,
    maxDeathParts:34,
    propSleepSpeed:.055,
    propSleepSeconds:1.15
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
    new BABYLON.Vector3(0,-.12,-3.6),
    new BABYLON.Vector3(15.8,.24,18.8),
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
  box("officeCeiling",new BABYLON.Vector3(0,4.0,-3.6),new BABYLON.Vector3(15.8,.18,18.8));
  box("officeLeftWall",new BABYLON.Vector3(-7.9,1.95,-3.6),new BABYLON.Vector3(.20,4.0,18.8));
  box("officeRightWall",new BABYLON.Vector3(7.9,1.95,-3.6),new BABYLON.Vector3(.20,4.0,18.8));

  // Front wall with an open doorway.
  box("frontWallL",new BABYLON.Vector3(-5.0,1.95,-5.2),new BABYLON.Vector3(5.95,4.0,.20));
  box("frontWallR",new BABYLON.Vector3(5.0,1.95,-5.2),new BABYLON.Vector3(5.95,4.0,.20));
  box("frontWallTop",new BABYLON.Vector3(0,3.45,-5.2),new BABYLON.Vector3(3.9,1.08,.20));

  // New rear exterior wall: the old wall at z=-4 is now an interior divider.
  box("rearOuterWall",new BABYLON.Vector3(0,1.95,-12.9),new BABYLON.Vector3(15.8,4.0,.20));

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
      destructionRewarded:false
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
  box("baseboardLeft",new BABYLON.Vector3(-4.88,.09,0),new BABYLON.Vector3(.055,.16,7.72),trimMat,false);
  box("baseboardRight",new BABYLON.Vector3(4.88,.09,0),new BABYLON.Vector3(.055,.16,7.72),trimMat,false);
  box("baseboardFrontL",new BABYLON.Vector3(-3.28,.09,-3.88),new BABYLON.Vector3(3.30,.16,.055),trimMat,false);
  box("baseboardFrontR",new BABYLON.Vector3(3.28,.09,-3.88),new BABYLON.Vector3(3.30,.16,.055),trimMat,false);

  // Carpet tile seams.
  for(let x=-4.5;x<=4.5;x+=1){
    box("carpetLineX"+x,new BABYLON.Vector3(x,.008,0),new BABYLON.Vector3(.009,.006,7.75),darkTrimMat,false);
  }
  for(let z=-3.5;z<=3.5;z+=1){
    box("carpetLineZ"+z,new BABYLON.Vector3(0,.009,z),new BABYLON.Vector3(9.75,.006,.009),darkTrimMat,false);
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
    const dir=hitDir.clone();
    if(dir.lengthSquared()<.001) dir.set(0,1,0);
    dir.normalize();

    const bloodCount=Math.round(70+strength*46);
    for(let i=0;i<bloodCount;i++){
      const drop=BABYLON.MeshBuilder.CreateSphere("bloodDrop",{
        diameter:.018+Math.random()*.045,
        segments:5
      },scene);
      drop.position=origin.add(new BABYLON.Vector3(
        (Math.random()-.5)*.22,
        (Math.random()-.5)*.28,
        (Math.random()-.5)*.22
      ));
      drop.material=Math.random()<.35?bloodBrightMat:bloodMat;

      const radial=new BABYLON.Vector3(
        (Math.random()-.5)*5.2,
        Math.random()*4.6,
        (Math.random()-.5)*5.2
      );

      fxBodies.push({
        mesh:drop,
        kind:"blood",
        radius:.018,
        vel:dir.scale((2.0+Math.random()*4.0)*strength).add(radial),
        spin:new BABYLON.Vector3(),
        life:2.1+Math.random()*1.2
      });
    }

    trimFxBodies();

    // Immediate nearby floor splats make the finishing hit feel heavier.
    for(let i=0;i<22;i++){
      const p=origin.add(new BABYLON.Vector3(
        (Math.random()-.5)*1.25,
        -origin.y+.01,
        (Math.random()-.5)*1.25
      ));
      const hit=surfaceSphereHit(ground,p,.06);
      if(hit) createBloodSplat(hit,.8+Math.random()*.7);
    }
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

  function spawnDebrisBox(pos,size,material,vel,life=4.2){
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

  function destroyOfficeProp(prop,hitPos,dir,speed){
    if(!prop || prop.broken) return;
    prop.broken=true;prop.loose=false;
    prop.hitMeshes.forEach(m=>m?.setEnabled?.(false));

    const center=prop.root.getAbsolutePosition?.()?.clone?.() || prop.root.position.clone();
    const d=dir.clone(); if(d.lengthSquared()<.001) d.set(0,1,0); d.normalize();
    const base=d.scale(Math.min(6,1.4+speed*.35)).add(new BABYLON.Vector3(0,.6+Math.random()*1.2,0));

    const chunk=(off,size,mat,scatter=1)=>{
      spawnDebrisBox(
        center.add(off),size,mat,
        base.add(new BABYLON.Vector3((Math.random()-.5)*scatter,Math.random()*scatter,(Math.random()-.5)*scatter)),
        4+Math.random()*1.8
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

  function updateOfficePhysics(dt){
    for(const p of officeProps){
      p.cooldown=Math.max(0,p.cooldown-dt);
      if(!p.loose || p.broken) continue;

      p.vel.y-=5.8*dt;
      p.root.position.addInPlace(p.vel.scale(dt));
      p.root.rotation.x+=p.ang.x*dt;
      p.root.rotation.y+=p.ang.y*dt;
      p.root.rotation.z+=p.ang.z*dt;
      p.vel.x*=Math.pow(.46,dt);
      p.vel.z*=Math.pow(.46,dt);
      p.ang.scaleInPlace(Math.pow(.32,dt));

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
  // Coins, XP, levels, KOs + 3 daily missions
  // ------------------------------------------------------------
  const SAVE_KEY="vrBatBrawl_v018";
  const todayKey=()=>new Date().toISOString().slice(0,10);

  let gameState={
    coins:0,xp:0,level:1,kills:0,destroyed:0,blocks:0,
    dailyDate:todayKey(),
    daily:{
      kill:{goal:2,progress:0,reward:30,claimed:false},
      destroy:{goal:5,progress:0,reward:25,claimed:false},
      block:{goal:3,progress:0,reward:25,claimed:false}
    }
  };

  function xpNeeded(level){ return 80+(level-1)*45; }

  function updateStatsUI(){
    const el=document.getElementById("gameStats");
    if(!el) return;
    const d=gameState.daily;
    el.innerHTML=
      `<b>LEVEL ${gameState.level}</b><br>`+
      `🪙 ${gameState.coins} &nbsp; XP ${gameState.xp}/${xpNeeded(gameState.level)}<br>`+
      `KOs ${gameState.kills} &nbsp; Broken ${gameState.destroyed}<br>`+
      `KO ${d.kill.progress}/${d.kill.goal} • BREAK ${d.destroy.progress}/${d.destroy.goal} • BLOCK ${d.block.progress}/${d.block.goal}`;
  }

  function saveGame(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(gameState));}catch(_){}
    updateStatsUI();
  }

  function loadGame(){
    try{
      const raw=localStorage.getItem(SAVE_KEY);
      if(raw){
        const saved=JSON.parse(raw);
        gameState={...gameState,...saved,daily:{...gameState.daily,...(saved.daily||{})}};
      }
    }catch(_){}

    if(gameState.dailyDate!==todayKey()){
      gameState.dailyDate=todayKey();
      gameState.daily={
        kill:{goal:2,progress:0,reward:30,claimed:false},
        destroy:{goal:5,progress:0,reward:25,claimed:false},
        block:{goal:3,progress:0,reward:25,claimed:false}
      };
      saveGame();
    }
  }

  function checkLevelUps(){
    let needed=xpNeeded(gameState.level);
    while(gameState.xp>=needed){
      gameState.xp-=needed;
      gameState.level++;
      gameState.coins+=20;
      needed=xpNeeded(gameState.level);
    }
  }

  function addXP(amount){
    gameState.xp+=Math.max(0,Math.round(amount));
    checkLevelUps();
    saveGame();
  }

  function progressDaily(kind,amount=1){
    const d=gameState.daily[kind];
    if(!d) return;
    d.progress=Math.min(d.goal,d.progress+amount);
    if(d.progress>=d.goal && !d.claimed){
      d.claimed=true;
      gameState.coins+=d.reward;
      gameState.xp+=15;
      checkLevelUps();
    }
    saveGame();
  }

  function recordKill(){
    gameState.kills++;
    gameState.coins+=12;
    gameState.xp+=36;
    checkLevelUps();
    progressDaily("kill",1);
  }

  function recordDestruction(){
    gameState.destroyed++;
    gameState.coins+=2;
    gameState.xp+=2;
    checkLevelUps();
    progressDaily("destroy",1);
  }

  function recordBlock(){
    gameState.blocks++;
    gameState.xp+=3;
    checkLevelUps();
    progressDaily("block",1);
  }

  function missionShort(){
    const d=gameState.daily;
    return `KO ${d.kill.progress}/${d.kill.goal} • BREAK ${d.destroy.progress}/${d.destroy.goal} • BLOCK ${d.block.progress}/${d.block.goal}`;
  }

  loadGame();
  updateStatsUI();
  const bootStats=document.getElementById("gameStats");
  if(bootStats && bootStats.textContent==="Loading..."){
    bootStats.textContent="Game loaded";
  }

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
  const PLAYER_GRAVITY = -2.60;
  const PUSH_GAIN = 1.68;
  const MAX_PLAYER_SPEED = 9.6;

  // ------------------------------------------------------------
  // Camera-fixed player HUD: always shows your own HP.
  // ------------------------------------------------------------
  const hudPlane = BABYLON.MeshBuilder.CreatePlane("playerHud",{width:1.05,height:.48},scene);
  hudPlane.setEnabled(false);
  const hudTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(hudPlane,900,420);

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

  const gameInfoText=new BABYLON.GUI.TextBlock();
  gameInfoText.text="LV 1 • 0 COINS";
  gameInfoText.color="#dbeafe";gameInfoText.fontSize=35;gameInfoText.fontWeight="700";gameInfoText.height="58px";
  hudStack.addControl(gameInfoText);

  const missionText=new BABYLON.GUI.TextBlock();
  missionText.text="";missionText.color="#cbd5e1";missionText.fontSize=24;missionText.height="48px";
  hudStack.addControl(missionText);

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

  const blockPlane=BABYLON.MeshBuilder.CreatePlane("blockPlane",{width:1.1,height:.42},scene);
  blockPlane.setEnabled(false);
  const blockTex=BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(blockPlane,700,250);
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
    youHpText.text=`YOU ${Math.max(0,Math.ceil(playerHP))} HP`;
    hpBar.width=Math.max(.001,playerHP/PLAYER_MAX_HP);
    hpBar.background = playerHP>55 ? "#22c55e" : playerHP>25 ? "#f59e0b" : "#ef4444";
    gameInfoText.text=`LV ${gameState.level} • ${gameState.coins} COINS • XP ${gameState.xp}/${xpNeeded(gameState.level)}`;
    missionText.text=missionShort();
    updateStatsUI();
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

    blockPlane.parent=xrCamera;
    blockPlane.position.set(.48,.18,1.15);
    blockPlane.rotation.set(0,Math.PI,0);
    blockPlane.setEnabled(false);
  }

  function hurtPlayer(amount, fromWorldPos) {
    if (playerDead || playerInvuln>0) return;
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

    if (playerHP<=0) {
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
    height:.145,radius:.072,tessellation:12
  },scene);
  chest.parent=chestRoot;
  chest.position.y=-.065;
  chest.scaling.z=.66;
  chest.material=MAT.accent;

  const belly = BABYLON.MeshBuilder.CreateSphere("playerWaist",{diameter:.095,segments:10},scene);
  belly.parent=chestRoot;
  belly.position.y=-.135;
  belly.scaling.set(1,.30,.62);
  belly.material=MAT.accent;

  const shoulderL = BABYLON.MeshBuilder.CreateSphere("shoulderL",{diameter:.068,segments:9},scene);
  shoulderL.parent=chestRoot;
  shoulderL.position.set(-.078,-.005,0);
  shoulderL.material=MAT.accent;

  const shoulderR = shoulderL.clone("shoulderR");
  shoulderR.parent=chestRoot;
  shoulderR.position.x=.078;

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

    // Micro torso: only a small upper-body marker under the headset.
    const topY=Math.max(.94,head.y-.070);
    const bottomY=Math.max(.84,head.y-.205);
    const bodyMid=(topY+bottomY)*.5;

    chestRoot.position.set(
      head.x + f.x*.045,
      bodyMid + .032,
      head.z + f.z*.045
    );
    chestRoot.rotation.y=Math.atan2(f.x,f.z);

    const bodyHeight=Math.max(.09,topY-bottomY);
    chest.scaling.y=Math.min(.72,bodyHeight/.145);
    belly.position.y=-Math.min(.130,bodyHeight+.015);
    belly.scaling.y=.28;
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

  function noiseBuffer(ac,duration=.16){
    const len=Math.max(1,Math.floor(ac.sampleRate*duration));
    const b=ac.createBuffer(1,len,ac.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    return b;
  }

  function playImpactSound(kind="body",strength=.5){
    const ac=audioCtx(); if(!ac) return;
    strength=Math.max(.05,Math.min(1.3,strength));
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
  let selectedVoice=null;
  let currentNpcUtterance=null;

  function voiceScore(v){
    const name=(v.name||"").toLowerCase();
    const lang=(v.lang||"").toLowerCase();
    let s=0;

    if(lang.startsWith("en-us")) s+=26;
    else if(lang.startsWith("en-gb")) s+=21;
    else if(lang.startsWith("en")) s+=13;

    const preferred=[
      ["samantha",70],["aaron",66],["daniel",64],["ava",62],
      ["allison",58],["tom",56],["susan",54],
      ["natural",50],["neural",50],["premium",46],["enhanced",44],
      ["siri",42],["microsoft",28],["google",20]
    ];
    for(const [key,value] of preferred){
      if(name.includes(key)) s+=value;
    }

    const avoid=[
      "compact","novelty","whisper","bells","bad news","good news",
      "cellos","zarvox","trinoids","boing","organ","bubbles","robot",
      "eddy","flo","grandma","grandpa"
    ];
    for(const key of avoid){
      if(name.includes(key)) s-=100;
    }

    return s;
  }

  function chooseVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices=speechSynthesis.getVoices();
    if (!voices.length) return;

    selectedVoice=[...voices].sort((a,b)=>voiceScore(b)-voiceScore(a))[0]||voices[0];
  }

  chooseVoice();
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged=chooseVoice;

  const NPC_VOICE_CLIPS={
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

  const VOICE_LINES={
    chase:[
      "Hey, where are you going?",
      "Come back here.",
      "You really want to do this?",
      "Okay. Come on then.",
      "Hey. I'm talking to you.",
      "Don't just walk away."
    ],
    angry:[
      "Ow! Stop doing that!",
      "Seriously? Cut it out!",
      "Okay, now you're making me angry.",
      "That's enough.",
      "What is wrong with you?",
      "Stop swinging that thing at me!"
    ],
    furious:[
      "Alright, that's it!",
      "I'm done messing around!",
      "You asked for this!",
      "Come here!",
      "Okay. Now I'm mad."
    ],
    hurt:[
      "Ow!",
      "Ah, that hurt!",
      "Damn, easy!",
      "Ow, seriously?",
      "Ah! Stop!",
      "What was that for?"
    ],
    scared:[
      "Okay, okay, stop!",
      "Wait. Just stop for a second!",
      "This is getting bad.",
      "Hey, calm down!",
      "Alright, enough!"
    ],
    attack:[
      "Come on!",
      "Got you!",
      "Take this!",
      "Here!",
      "Try dodging this!"
    ],
    block:[
      "What?",
      "You blocked it?",
      "Come on!",
      "Seriously?"
    ],
    death:[
      "Oh—!",
      "Wait—!",
      "No—!"
    ]
  };
  function speakNpc(kind,force=false) {
    if (!npc || npc.dead || !("speechSynthesis" in window)) return;

    // NPC should NOT constantly talk.
    // Even when code asks for a line, most ordinary reactions stay silent.
    if(!force){
      const chance={
        chase:.10,
        angry:.16,
        furious:.24,
        hurt:.14,
        scared:.18,
        attack:.12,
        block:.16,
        death:1
      }[kind] ?? .12;

      if(Math.random()>chance) return;
      if(npc.speechCooldown>0) return;
    }else{
      // Forced reactions still get throttled unless it is the death line.
      if(kind!=="death" && npc.speechCooldown>1.1 && Math.random()<.72) return;
    }

    const lines=VOICE_LINES[kind]||VOICE_LINES.chase;
    const line=lines[Math.floor(Math.random()*lines.length)];

    const playedHumanClip=tryPlayHumanVoice(kind);

    // Long quiet gaps between lines.
    npc.speechCooldown=
      kind==="death" ? 0 :
      4.6+Math.random()*3.8;

    npc.bubbleTimer=1.65;
    npc.speech.text.text=line;
    npc.speech.plane.setEnabled(true);

    if(playedHumanClip) return;

    try {
      const u=new SpeechSynthesisUtterance(line);
      if(selectedVoice) u.voice=selectedVoice;

      // Keep volume and pitch in a restrained human range.
      u.volume=.84;

      if(kind==="furious"){
        u.rate=.97+Math.random()*.018;
        u.pitch=.96+Math.random()*.015;
      }else if(kind==="angry"){
        u.rate=.96+Math.random()*.018;
        u.pitch=.97+Math.random()*.015;
      }else if(kind==="scared"){
        u.rate=.99+Math.random()*.02;
        u.pitch=1.00+Math.random()*.015;
      }else if(kind==="hurt"){
        u.rate=.97+Math.random()*.02;
        u.pitch=.99+Math.random()*.015;
      }else if(kind==="attack"){
        u.rate=.98+Math.random()*.018;
        u.pitch=.98+Math.random()*.015;
      }else{
        u.rate=.95+Math.random()*.018;
        u.pitch=.99+Math.random()*.012;
      }

      // Avoid overlapping dialogue.
      if(speechSynthesis.speaking){
        if(kind==="death"){
          speechSynthesis.cancel();
        }else{
          return;
        }
      }

      currentNpcUtterance=u;
      u.onend=()=>{ if(currentNpcUtterance===u) currentNpcUtterance=null; };
      u.onerror=()=>{ if(currentNpcUtterance===u) currentNpcUtterance=null; };

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
    if(npc.attackAnim>0 && (isInXR() || testAIEnabled)){
      const progress=1-(npc.attackAnim/npc.attackDuration);
      const shoulder=rd.points.rShoulder.base.clone();

      const spheres=playerHitSpheres();
      const targetWorld=(spheres[1]?.center || playerWorldPos()).clone();
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
    const gravity=active ? -4.8 : -7.1;
    const damping=active ? .925 : .975;

    let strength=.155;
    if(npc.dead && npc.deathPhase==="stagger") strength=.038;
    else if(npc.recovering) strength=.46;
    else if(npc.stun>0) strength=.010;
    else if(npc.recentlyHit>0) strength=.024;
    else if(npc.emotion==="angry") strength=.185;
    else if(npc.emotion==="scared") strength=.125;

    for(const p of rd.list){
      const vel=p.pos.subtract(p.prev).scale(damping);
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

    // More iterations = tighter joints. Five is a good Quest 2 compromise.
    for(let iteration=0;iteration<11;iteration++){
      for(const c of rd.constraints) solveRagConstraint(c);
      for(const p of rd.list) collideNpcRagdollPoint(p,dt);
    }

    updateNpcRagdollMeshes();

    if(npc.typeName==="Tank"){
      speakNpc("angry",true);
    }else if(npc.typeName==="Runner"){
      speakNpc("scared",true);
    }
  }

  function updateNpcFace(dt){
    if(!npc || npc.dead) return;

    npc.faceBlink-=dt;
    if(npc.faceBlink<=0){
      npc.faceBlink=1.7+Math.random()*3;
      npc.faceBlinkAmount=1;
    }
    npc.faceBlinkAmount=Math.max(0,npc.faceBlinkAmount-dt*11);
    const blink=npc.faceBlinkAmount>0?.18:1;
    npc.leftEyeWhite.scaling.y=.58*blink;
    npc.rightEyeWhite.scaling.y=.58*blink;

    const target=playerWorldPos();
    const headWorld=npcLocalToWorld(npc.ragdoll.points.head.pos);
    const local=worldVectorToNpcLocal(target.subtract(headWorld));
    const px=BABYLON.Scalar.Clamp(local.x*.025,-.018,.018);
    const py=BABYLON.Scalar.Clamp(local.y*.012,-.012,.012);
    npc.leftPupil.position.x=-.068+px;npc.rightPupil.position.x=.068+px;
    npc.leftPupil.position.y=.060+py;npc.rightPupil.position.y=.060+py;

    if(npc.emotion==="angry"){
      npc.eyebrowL.rotation.z=-.28;npc.eyebrowR.rotation.z=.28;
      npc.mouth.scaling.x=1.05;npc.mouth.scaling.y=.75;
    }else if(npc.emotion==="scared"){
      npc.eyebrowL.rotation.z=.12;npc.eyebrowR.rotation.z=-.12;
      npc.mouth.scaling.x=.72;npc.mouth.scaling.y=2.2;
    }else{
      npc.eyebrowL.rotation.z=-.08;npc.eyebrowR.rotation.z=.08;
      npc.mouth.scaling.x=1;npc.mouth.scaling.y=1;
    }
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
      {skin:"#c98b68",skinDark:"#a86c50",shirt:"#486b8f",shirtDark:"#304c69"},
      {skin:"#d2a17e",skinDark:"#b37f60",shirt:"#5e6948",shirtDark:"#3d4931"},
      {skin:"#a96f50",skinDark:"#86543c",shirt:"#7a4d57",shirtDark:"#52333b"},
      {skin:"#e0b18b",skinDark:"#bf8968",shirt:"#4c6079",shirtDark:"#303e50"}
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
    const hairBase=
      archetype.name==="Runner" ? "#3a2a20" :
      archetype.name==="Tank" ? "#201812" :
      archetype.name==="Bruiser" ? "#38261d" : "#30231c";
    const hairMat=mkMat("npcHair"+Math.random(),hairBase);
    const beardMat=mkMat("npcBeard"+Math.random(),"#4b3429");
    beardMat.alpha=.48;
    // v0.23.7 smoother NPC beard: no noisy diffuse texture;
    const teethMat=mkMat("npcTeeth"+Math.random(),"#f4eee5");

    // clean v0.23.3: skinMat.diffuseTexture=DETAIL_TEX.skin;
    // clean v0.23.3: skinDarkMat.diffuseTexture=DETAIL_TEX.skin;
    // clean v0.23.3: shirtMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: shirtDarkMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: pantsMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: pantsDarkMat.diffuseTexture=DETAIL_TEX.fabric;
    // clean v0.23.3: shoeMat.diffuseTexture=DETAIL_TEX.metal;
    // clean v0.23.3: hairMat.diffuseTexture=DETAIL_TEX.hair;
    // Give the NPC the same clean material style as the office.
    skinMat.diffuseTexture=DETAIL_TEX.skin;skinMat.diffuseTexture.level=.35;
    skinDarkMat.diffuseTexture=DETAIL_TEX.skin;skinDarkMat.diffuseTexture.level=.28;
    shirtMat.diffuseTexture=DETAIL_TEX.wall;shirtMat.diffuseTexture.level=.22;
    shirtDarkMat.diffuseTexture=DETAIL_TEX.wall;shirtDarkMat.diffuseTexture.level=.18;
    pantsMat.diffuseTexture=DETAIL_TEX.fabric;pantsMat.diffuseTexture.level=.14;
    pantsDarkMat.diffuseTexture=DETAIL_TEX.fabric;pantsDarkMat.diffuseTexture.level=.10;
    hairMat.diffuseTexture=DETAIL_TEX.hair;hairMat.diffuseTexture.level=.12;

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
      height:.405,
      radius:.178,
      tessellation:22
    },scene);
    head.parent=visual;
    head.material=skinMat;
    head.scaling.set(.93,1,.86);
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

    const leftEyeWhite=faceSphere("npcLeftEyeWhite",.052,[-.068,.060,.192],eyeWhiteMat,[1.12,.58,.28]);
    const rightEyeWhite=faceSphere("npcRightEyeWhite",.052,[.068,.060,.192],eyeWhiteMat,[1.12,.58,.28]);
    const leftEye=faceSphere("npcLeftEye",.023,[-.068,.060,.205],eyeMat,[1,1,.28]);
    const rightEye=faceSphere("npcRightEye",.023,[.068,.060,.205],eyeMat,[1,1,.28]);
    const leftPupil=faceSphere("npcLeftPupil",.011,[-.068,.060,.214],pupilMat,[1,1,.25]);
    const rightPupil=faceSphere("npcRightPupil",.011,[.068,.060,.214],pupilMat,[1,1,.25]);

    const mouth=BABYLON.MeshBuilder.CreateBox("npcMouth",{
      width:.105,height:.022,depth:.010
    },scene);
    mouth.parent=head;
    mouth.position.set(0,-.102,.188);
    mouth.material=pupilMat;

    const upperLip=BABYLON.MeshBuilder.CreateCapsule("npcUpperLip",{
      height:.105,radius:.009,tessellation:10
    },scene);
    upperLip.parent=head;upperLip.rotation.z=Math.PI/2;
    upperLip.position.set(0,-.095,.194);upperLip.material=skinDarkMat;

    const lowerLip=BABYLON.MeshBuilder.CreateCapsule("npcLowerLip",{
      height:.096,radius:.010,tessellation:10
    },scene);
    lowerLip.parent=head;lowerLip.rotation.z=Math.PI/2;
    lowerLip.position.set(0,-.114,.194);lowerLip.material=skinDarkMat;

    const teeth=BABYLON.MeshBuilder.CreateBox("npcTeeth",{
      width:.070,height:.010,depth:.006
    },scene);
    teeth.parent=head;teeth.position.set(0,-.102,.196);teeth.material=teethMat;

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
      width:.10,height:.018,depth:.012
    },scene);
    eyebrowL.parent=head;eyebrowL.position.set(-.085,.145,.236);eyebrowL.rotation.z=-.08;eyebrowL.material=hairMat;
    const eyebrowR=eyebrowL.clone("npcEyebrowR");eyebrowR.parent=head;eyebrowR.position.x=.085;eyebrowR.rotation.z=.08;

    const hair=BABYLON.MeshBuilder.CreateSphere("npcHair",{
      diameter:.425,segments:18
    },scene);
    hair.parent=head;
    hair.position.set(0,.135,-.055);
    hair.scaling.set(.74,.27,.80);
    hair.material=hairMat;

    // Receding/thinning hairline for a less cartoon-like silhouette.
    const templeL=faceSphere("npcTempleHairL",.115,[-.155,.095,-.075],hairMat,[.50,.95,.45]);
    const templeR=faceSphere("npcTempleHairR",.115,[.155,.095,-.075],hairMat,[.50,.95,.45]);

    // Small side hair patches.
    for(const sx of [-1,1]){
      const side=faceSphere(
        "npcSideHair"+sx,.18,[sx*.19,.105,-.08],hairMat,[.55,1,.55]
      );
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
      abdomen,torso,neck,chestPlate,pelvis,spineJoint,neckJoint,
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
      weaponRoot:weapon.root,weaponTip:weapon.tip,weaponCfg:weapon.cfg,

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
      attackDuration:.48,
      attackHasHit:false,
      attackBlocked:false,
      weaponPrevTip:null,
      stun:0,
      walkPhase:0,
      walkingNow:false,
      speechCooldown:0,
      bubbleTimer:0,
      emotion:archetype.preferredEmotion||"normal",
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

  function updateNpcLabel() {
    if(!npc?.hp) return;

    const hp=Math.max(0,Math.ceil(npc.hpValue));
    const max=Math.max(1,npc.maxHp||160);
    const pct=BABYLON.Scalar.Clamp(hp/max,0,1);

    npc.hp.text.text=`${npc.typeName||"NPC"} • ${hp} / ${max} HP`;
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
        r.vel.subtractInPlace(hit.normal.scale(vn*1.06));
        r.vel.scaleInPlace(.58);
      }
    }
  }
  function moveDeathPart(r,dt) {
    const delta=r.vel.scale(dt);
    const steps=Math.max(1,Math.ceil(delta.length()/.032));
    const step=delta.scale(1/steps);
    for(let i=0;i<steps;i++){
      r.mesh.position.addInPlace(step);
      resolveDeathPart(r);
    }
  }

  function spawnDeathJointBlood(dir){
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
      spawnBloodExplosion(origin,localDir,.20+(i%3)*.03);
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
        vel.addInPlace(outward.scale(.75+Math.random()*1.05));
      }

      deathParts.push({
        mesh,
        vel,
        radius,
        life:5.9,
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
    recordKill();
    npc.hpFlashTimer=.22;
    updateNpcLabel();

    // Keep the health bar for a short instant, then hide it during collapse.
    npc.deathPhase="stagger";
    npc.deathExploded=false;
    npc.deathTimer=.40;
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

    pulse(hands.right,1,145);
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

  function swingDamage(speed) {
    // Much lower continuous damage in v0.14.
    // Soft hits can do 1-3, normal swings around the middle,
    // and only very hard swings approach the cap.
    if (speed<.22) return 0;

    const raw = 0.35 + 0.56*Math.pow(speed,1.43);
    return Math.round(Math.max(1,Math.min(24,raw)));
  }

  function damageNpc(hitPos,swingVel,speed) {
    if (!npc || npc.dead || npc.hitCooldown>0) return;

    const hit=classifyNpcHit(hitPos);
    const baseDamage=swingDamage(speed);
    if(baseDamage<=0) return;
    const damage=Math.max(1,Math.round(baseDamage*hit.mult));

    npc.hpValue-=damage;
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

    pulse(hands.right,Math.min(1,.22+speed*.09),35+Math.min(75,speed*5));
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
          const tp=document.getElementById("testPanel");if(tp) tp.style.display="none";
          const gs=document.getElementById("gameStats");if(gs) gs.style.display="none";
          attachHud();
          updatePlayerHud();
          chestRoot.setEnabled(true);
          bodyVelocity.set(0,0,0);
          batTipLast=null;
          batBaseLast=null;
          for(const side of ["left","right"]) {
            hands[side].trackLast=null;
            hands[side].contact=false;
            hands[side].waitClear=false;
          }
          chooseVoice();
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
      if (deathTimer<=0) respawnPlayer();
    }

    // NPC
    if (npc) {
      npc.hitCooldown=Math.max(0,npc.hitCooldown-dt);
      npc.hpFlashTimer=Math.max(0,npc.hpFlashTimer-dt);
      updateNpcLabel();
      npc.attackCooldown=Math.max(0,npc.attackCooldown-dt);
      npc.throwCooldown=Math.max(0,npc.throwCooldown-dt);
      npc.attackAnim=Math.max(0,npc.attackAnim-dt);
      npc.recentlyHit=Math.max(0,npc.recentlyHit-dt);
      npc.speechCooldown=Math.max(0,npc.speechCooldown-dt);
      npc.bubbleTimer=Math.max(0,npc.bubbleTimer-dt);
      if (npc.bubbleTimer<=0) npc.speech.plane.setEnabled(false);

      if (!npc.dead) {
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

        if (!npc.recovering && (isInXR() || testAIEnabled) && !playerDead) {
          const playerPos=playerWorldPos();
          const toPlayer=playerPos.subtract(npc.root.position);
          toPlayer.y=0;
          const d=toPlayer.length();
          let walking=false;

          if (!npc.greeted && d<5.5) {
            npc.greeted=true;
            speakNpc("chase",true);
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

            if (npc.speechCooldown<=0 && Math.random()<.014) {
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
            d<=2.25 &&
            npcIsFullyUpright() &&
            npc.stun<=0 &&
            npc.attackAnim<=0 &&
            npc.attackCooldown<=0
          ) {
            const armPenalty=BABYLON.Scalar.Clamp(npc.injuries.rightArm/100,0,.7);
            npc.attackCooldown=(npc.archetype?.attackRate ?? .38)+armPenalty*.42;
            npc.attackAnim=npc.attackDuration*(1+armPenalty*.34);
            npc.attackHasHit=false;
            npc.attackBlocked=false;
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
            const liveTarget=playerWorldPos().subtract(npc.root.position);
            liveTarget.y=0;

            if(liveTarget.lengthSquared()>.001){
              liveTarget.normalize();
              const desiredYaw=Math.atan2(liveTarget.x,liveTarget.z);

              let deltaYaw=desiredYaw-npc.root.rotation.y;
              deltaYaw=Math.atan2(Math.sin(deltaYaw),Math.cos(deltaYaw));
              npc.root.rotation.y+=deltaYaw*Math.min(1,dt*22);
            }

            // Aim weapon height toward current chest/head height.
            const playerSpheres=playerHitSpheres();
            const targetSphere=playerSpheres[1] || playerSpheres[0];
            const targetWorld=(targetSphere?.center || playerWorldPos()).clone();
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
            npc.weaponRoot.rotation.y=localSide*.58;

            const tip=npc.weaponTip.getAbsolutePosition().clone();
            const prev=npc.weaponPrevTip||tip;
            npc.weaponPrevTip=tip.clone();

            // Reliable bat block:
            // compare the NPC weapon's swept path against the entire player bat.
            if (!npc.attackBlocked && batRoot.isEnabled()) {
              const bb=batBase();
              const bt=batTip();

              const prevBb=batBaseLast || bb;
              const prevBt=batTipLast || bt;

              const dNow=segmentSegmentDistance(prev,tip,bb,bt);
              const dPrevBat=segmentSegmentDistance(prev,tip,prevBb,prevBt);

              // Also check weapon tip against current/previous bat for edge cases.
              const dTipNow=Math.min(
                pointSegmentDistance(tip,bb,bt),
                pointSegmentDistance(prev,bb,bt),
                pointSegmentDistance(tip,prevBb,prevBt)
              );

              const blockDist=Math.min(dNow,dPrevBat,dTipNow);

              // Larger and earlier block window than v0.14.
              if(blockDist<.185 && progress>.23 && progress<.93){
                npc.attackBlocked=true;
                npc.attackHasHit=true;
                npc.attackAnim=0;
                npc.stun=.62;

                let push=npc.root.position.subtract(playerWorldPos());
                push.y=0;
                if(push.lengthSquared()<.001) push.set(0,0,1);
                push.normalize();

                npc.velocity.addInPlace(push.scale(1.45));

                // Strong feedback so the player knows it was a successful block.
                pulse(hands.right,1,135);
                pulse(hands.left,.35,55);
                playImpactSound("block",1);
                recordBlock();

                npc.anger=Math.min(100,npc.anger+14);
                speakNpc("block",false);
              }
            }

            // Real swept hitbox against head/chest/hips.
            if (!npc.attackBlocked && !npc.attackHasHit && progress>.38) {
              const hit=playerHitSpheres().some(s=>
                segmentSphereHit(prev,tip,s.center,s.radius+.085)
              );

              if(hit){
                npc.attackHasHit=true;
                const armWeak=BABYLON.Scalar.Clamp(1-npc.injuries.rightArm*.004,.62,1);
                hurtPlayer(Math.max(1,Math.round(npc.weaponCfg.damage*(npc.archetype?.attackMul||1)*armWeak)),npc.root.position);

                let away=playerWorldPos().subtract(npc.root.position);
                away.y=0;
                if(away.lengthSquared()<.001) away.set(0,0,-1);
                away.normalize();

                bodyVelocity.addInPlace(
                  away.scale(npc.weaponCfg.knockback*(npc.archetype?.knockbackMul||1)*.62)
                    .add(new BABYLON.Vector3(0,.38,0))
                );
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

        npc.velocity.y-=2.8*dt;
        moveNpc(npc.velocity.scale(dt));

        npc.root.rotation.x+=npc.angular.x*dt;
        npc.root.rotation.y+=npc.angular.y*dt;
        npc.root.rotation.z+=npc.angular.z*dt;

        npc.velocity.x*=Math.pow(.34,dt);
        npc.velocity.z*=Math.pow(.34,dt);
        npc.angular.scaleInPlace(Math.pow(.18,dt));

        if(npc.deathPhase==="stagger"){
          npc.deathTimer-=dt;
          updateNpcRagdoll(dt,true);

          if(npc.deathTimer<=0){
            npc.deathPhase="collapse";
            npc.deathTimer=.28;
            npc.ragdoll.dead=true;
            npc.hp.plane.setEnabled(false);
          }
        }else if(npc.deathPhase==="collapse"){
          npc.deathTimer-=dt;
          updateNpcRagdoll(dt,false);

          if(npc.deathTimer<=0 && !npc.deathExploded){
            npc.deathExploded=true;
            npc.deathPhase="exploded";

            const chestWorld=npcLocalToWorld(npc.ragdoll.points.chest.pos);

            // Break the ragdoll apart from its CURRENT physical pose.
            spawnDeathRagdollFromCurrent(
              npc.deathDir,
              Math.min(12.5,5.8+npc.deathSpeed*.48)
            );

            // Very heavy stylized blood burst.
            spawnBloodExplosion(chestWorld,npc.deathDir,2.6);
            spawnDeathJointBlood(npc.deathDir);
            spawnDeathJointBlood(
              npc.deathDir.add(new BABYLON.Vector3(0,.35,0))
            );

            npc.visual.setEnabled(false);
            npc.weaponRoot.setEnabled(false);
            playImpactSound("body",1.2);
          }
        }

        if (npc.respawnTimer<=0) {
          npc.root.dispose();
          createNpc();
          npc.root.position=new BABYLON.Vector3(
            (Math.random()-.5)*2.4,
            0,
            .4+Math.random()*1.6
          );
        }

      }
    }

    // Detached death parts after the finishing explosion.
    for(let i=deathParts.length-1;i>=0;i--){
      const r=deathParts[i];
      r.life-=dt;
      r.vel.y-=7.2*dt;
      moveDeathPart(r,dt);

      r.mesh.rotation.x+=r.spin.x*dt;
      r.mesh.rotation.y+=r.spin.y*dt;
      r.mesh.rotation.z+=r.spin.z*dt;

      r.vel.x*=Math.pow(.72,dt);
      r.vel.z*=Math.pow(.72,dt);
      r.spin.scaleInPlace(Math.pow(.50,dt));

      if(r.life<=0 || r.mesh.position.y<-5.4){
        r.mesh.dispose();
        deathParts.splice(i,1);
      }
    }


    updateOfficePhysics(dt);

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
        xrCamera.position.x=Math.max(-4.70,Math.min(4.70,xrCamera.position.x));
        xrCamera.position.z=Math.max(-8.65,Math.min(3.65,xrCamera.position.z));
        xrCamera.position.y=Math.min(4.2,xrCamera.position.y);

        updateBodyVisual();

        if (batRoot.isEnabled()) {
          const tip=batTip();
          if (batTipLast) {
            const vel=tip.subtract(batTipLast).scale(1/Math.max(dt,.008));
            const speed=vel.length();

            // Office objects and windows use the entire swept bat path.
            handleBatOfficeHit(batTipLast,tip,vel,speed);

            if(speed>.28 && batHitCooldown<=0){
              const npcHit=npcBatSweepHit(
                batTipLast,
                tip,
                batBase(),
                .235
              );

              if(npcHit){
                batHitCooldown=.12;
                damageNpc(npcHit.point,vel,speed);
              }
            }

            const wc=surfaceContact(tip,.11);
            if (wc && speed>1.7 && batHitCooldown<=0) {
              batHitCooldown=.12;
              pulse(hands.right,Math.min(.85,.18+speed*.055),25+Math.min(50,speed*3));
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
    createNpc();npc.root.position=new BABYLON.Vector3(0,0,1);
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

      if(a==="soft") testHit(1.2);
      else if(a==="medium") testHit(3.3);
      else if(a==="hard") testHit(6.2);
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

  bindTestControls();
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

  engine.runRenderLoop(()=>scene.render());
  addEventListener("resize",()=>engine.resize());
})();