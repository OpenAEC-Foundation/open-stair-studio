export const timberDimensions = [
  {key:'newelWidth', label:'Breedte trappaal', min:40, max:130, value:75},
  {key:'balusterWidth', label:'Breedte spijl', min:16, max:60, value:30},
  {key:'balusterPitch', label:'Max. h.o.h. spijlen', min:80, max:200, value:125},
  {key:'handrailWidth', label:'Breedte handlijst', min:36, max:100, value:60},
  {key:'handrailDepth', label:'Hoogte handlijst', min:32, max:95, value:58}
];
export const timberDefaults = {
  timberDetail:'basic', noseProfile:'square', noseSize:8, wel:null, wellatType:'none', wellatWidth:6,wellatHeight:16,
  ...Object.fromEntries(timberDimensions.map(f=>[f.key,f.value]))
};
export const timberStyles = {basic:'Basis · ronde greep en metalen spijlen',classic:'Klassiek · gedraaid hout',modern:'Modern · verjongd hout'};
export const noseNames = {square:'Recht',round:'Kwartrond',bevel:'Afschuining 45°'};
