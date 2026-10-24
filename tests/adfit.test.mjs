import test from 'node:test';
import assert from 'node:assert/strict';
import {isAdMobNativeWebView,mountAdBanner,validAdPlacement} from '../public/js/ads.js';

class Element {
  constructor(width=320,height=100){this.children=[];this.dataset={};this.style={};this.hidden=true;this.width=width;this.height=height;this.attributes={};this.classList={add(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this.attributes[name]=value;}
  getBoundingClientRect(){return {width:this.width,height:this.height};}
  querySelector(selector){if(selector==='iframe')return this.children.find(child=>child.tagName==='iframe')||null;return null;}
}

function setup({unit='DAN-testunit1234',userAgent='Browser/1',width=320,after=0}={}){
  const creative=new Element(width,100);
  const host=new Element(width,132);
  host.querySelector=selector=>selector==='.adfit-creative'?creative:null;
  const listeners=new Map();
  const doc={hidden:false,createElement(tagName){const element=new Element();element.tagName=tagName;return element;},addEventListener(type,callback){listeners.set(type,callback);}};
  class IntersectionObserver {constructor(callback){this.callback=callback;}observe(){this.callback([{isIntersecting:true}]);}unobserve(){}disconnect(){}}
  const win={navigator:{userAgent},location:{origin:'https://softm.github.io',pathname:'/hydrogenstation/'},IntersectionObserver,setTimeout(){return 1;},clearTimeout(){}};
  const controller=mountAdBanner({host,root:null,config:{enabled:true,unit,width:320,height:100,after},win,doc});
  return {controller,host,creative,win,listeners};
}

test('수소한눈 전용 320x100 지면만 유효하다',()=>{
  assert.equal(validAdPlacement({unit:'DAN-br2FK1ogdWkvz5PH',width:320,height:100}),true);
  assert.equal(validAdPlacement({unit:'',width:320,height:100}),false);
  assert.equal(validAdPlacement({unit:'DAN-br2FK1ogdWkvz5PH',width:300,height:250}),false);
});

test('목록 기준을 넘고 화면에 접근했을 때 한 번만 요청한다',()=>{
  const state=setup({after:6});
  state.controller.update(6);
  assert.equal(state.creative.children.length,0);
  state.controller.update(7);
  state.controller.update(20);
  assert.equal(state.host.hidden,false);
  assert.equal(state.creative.children.length,2);
  assert.equal(state.creative.children[0].attributes['data-ad-unit'],'DAN-testunit1234');
  assert.equal(state.creative.children[0].attributes['data-ad-width'],'320');
});

test('AdMob 네이티브 WebView와 폭 부족 지면은 광고와 빈 공간을 모두 숨긴다',()=>{
  assert.equal(isAdMobNativeWebView('Browser/1 AdMobNative/1'),true);
  const native=setup({userAgent:'Browser/1 AdMobNative/1'});
  native.controller.update(true);
  assert.equal(native.host.hidden,true);
  assert.equal(native.creative.children.length,0);
  const narrow=setup({width:319});
  narrow.controller.update(true);
  assert.equal(narrow.host.hidden,true);
  assert.equal(narrow.creative.children.length,0);
});

test('NOAD 콜백은 해당 지면만 비우고 숨긴다',()=>{
  const state=setup();
  state.controller.update(true);
  const ad=state.creative.children[0];
  state.win[ad.attributes['data-ad-onfail']](ad);
  assert.equal(state.host.hidden,true);
  assert.equal(state.creative.children.length,0);
  assert.equal(state.host.dataset.adState,'unfilled');
});
