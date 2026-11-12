"""Reproducible, dependency-free native BLE sample harness. No signing credentials."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parent
from icon_generator import png
assets=ROOT/'Assets.xcassets'
icon=assets/'AppIcon.appiconset'
icon.mkdir(parents=True,exist_ok=True)
(assets/'Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}}))
(icon/'AppIcon.png').write_bytes(png(1024))
(icon/'Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}}))
for filename,size in [('NarvieIcon60@2x.png',120),('NarvieIcon60@3x.png',180)]:
    (ROOT/filename).write_bytes(png(size))
project=ROOT/'NarvieMyTagTest.xcodeproj'
project.mkdir(exist_ok=True)
def ident(n):return f'{n:024X}'
objects=[]
def add(n,body):objects.append(f'{ident(n)} = {{ {body} }};')
names=['NarvieMyTagApp.swift','TrackerBluetooth.swift','CityTagProtocol.swift']
for i,name in enumerate(names):
    add(20+i,f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = "<group>";')
    add(30+i,f'isa = PBXBuildFile; fileRef = {ident(20+i)};')
add(24,'isa = PBXFileReference; lastKnownFileType = image.png; path = "NarvieIcon60@2x.png"; sourceTree = "<group>";')
add(26,'isa = PBXFileReference; lastKnownFileType = image.png; path = "NarvieIcon60@3x.png"; sourceTree = "<group>";')
add(34,f'isa = PBXBuildFile; fileRef = {ident(24)};')
add(36,f'isa = PBXBuildFile; fileRef = {ident(26)};')
add(25,'isa = PBXFileReference; explicitFileType = wrapper.application; path = NarvieMyTagTest.app; sourceTree = BUILT_PRODUCTS_DIR;')
add(1,f'isa = PBXProject; buildConfigurationList = {ident(10)}; compatibilityVersion = "Xcode 14.0"; developmentRegion = nl; knownRegions = (nl,en,Base); mainGroup = {ident(2)}; productRefGroup = {ident(3)}; projectDirPath = ""; projectRoot = ""; targets = ({ident(4)});')
add(2,f'isa = PBXGroup; children = ({ident(5)},{ident(3)}); sourceTree = "<group>";')
add(3,f'isa = PBXGroup; children = ({ident(25)}); name = Products; sourceTree = "<group>";')
add(5,'isa = PBXGroup; children = ('+','.join(ident(i) for i in [20,21,22,24,26])+'); path = "."; sourceTree = "<group>";')
add(4,f'isa = PBXNativeTarget; buildConfigurationList = {ident(11)}; buildPhases = ({ident(6)},{ident(7)},{ident(8)}); buildRules = (); dependencies = (); name = NarvieMyTagTest; productName = NarvieMyTagTest; productReference = {ident(25)}; productType = "com.apple.product-type.application";')
add(6,'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('+','.join(ident(i) for i in [30,31,32])+'); runOnlyForDeploymentPostprocessing = 0;')
add(7,'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
add(8,f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({ident(34)},{ident(36)}); runOnlyForDeploymentPostprocessing = 0;')
for n,configs in [(10,[12,13]),(11,[14,15])]:add(n,'isa = XCConfigurationList; buildConfigurations = ('+','.join(ident(i) for i in configs)+'); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
for n,name in [(12,'Debug'),(13,'Release')]:add(n,f'isa = XCBuildConfiguration; buildSettings = {{ CLANG_ENABLE_MODULES = YES; SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SWIFT_VERSION = 5.0; }}; name = {name};')
for n,name in [(14,'Debug'),(15,'Release')]:
    add(n,f'isa = XCBuildConfiguration; buildSettings = {{ CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 6; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; MARKETING_VERSION = 0.4.2; PRODUCT_BUNDLE_IDENTIFIER = nl.narvie.mytag.sampletest; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = 1; SWIFT_OPTIMIZATION_LEVEL = "'+('-Onone' if name=='Debug' else '-O')+f'"; }}; name = {name};')
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {ident(1)}; }}\n')
print(project)
