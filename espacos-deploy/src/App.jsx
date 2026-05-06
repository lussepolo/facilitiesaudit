import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SHEETS_URL = import.meta.env.VITE_SHEETS_URL || "";
const SHEETS_ON  = SHEETS_URL.startsWith("https://script.google.com");

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  .app {
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    background:#F5F7FA;
    min-height:100vh;
    min-height:100dvh;
    color:#0F172A;
    max-width:430px;
    margin:0 auto;
    box-shadow:0 0 0 1px rgba(15,23,42,.04), 0 24px 70px rgba(15,23,42,.12);
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(10px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .au { animation:fadeUp .3s ease both; }
  .tap { cursor:pointer; transition:opacity .12s; }
  .tap:active { opacity:.7; }
  .btn-scale { transition:transform .12s ease, box-shadow .12s ease, opacity .12s ease; cursor:pointer; }
  .btn-scale:active { transform:scale(.97); }
  .score-btn {
    width:100%; min-height:52px; border-radius:999px; border:1.5px solid;
    font-size:16px; font-weight:900;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    padding:0 12px;
    line-height:1.18;
    text-align:center;
    box-shadow:0 1px 0 rgba(15,23,42,.04);
    transition:transform .1s, box-shadow .12s, border-color .12s, background .12s;
    flex-shrink:0;
  }
  .score-btn:active { transform:scale(.84); }
  textarea, input, button { font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif; outline:none; }
  textarea:focus, input:focus {
    border-color:#F5C200 !important;
    box-shadow:0 0 0 3px rgba(245,194,0,.18) !important;
  }
  input[type=file] { display:none; }
`;

// ─── Tokens ───────────────────────────────────────────────────────────────────
const INK   = "#111827";
const INK2  = "#1F2937";
const MUTED = "#667085";
const FAINT = "#98A2B3";
const PAPER = "#FFFFFF";
const SHEET = "#F8FAFC";
const RING  = "#D9E1EA";
const BG    = "#F5F7FA";
const YELLOW= "#F5C200";
const BLUE  = "#1F4E79";
const DARK_BLUE = "#14324F";
const SOFT_BLUE = "#E8F1F8";
const SUCCESS = "#15803D";
const WARNING = "#B45309";
const DANGER = "#B42318";
const SHADOW="0 16px 36px rgba(17,24,39,.08)";
const SOFT_SHADOW="0 8px 24px rgba(17,24,39,.06)";
const GLASS_SURFACE="rgba(255,255,255,.74)";
const GLASS_BLUE="rgba(232,241,248,.78)";
const GLASS_BORDER="rgba(217,225,234,.72)";
const GLASS_SHADOW="0 18px 42px rgba(17,24,39,.12)";
const GLASS_BLUR="blur(18px) saturate(1.35)";

const SC={
  0:{bg:"#FEE2E2",br:"#FCA5A5",tx:"#7F1D1D",lbl:"Crítico"},
  1:{bg:"#FEE2E2",br:"#FECACA",tx:"#991B1B",lbl:"Inaceitável"},
  2:{bg:"#FFEDD5",br:"#FED7AA",tx:"#9A3412",lbl:"Abaixo"},
  3:{bg:"#FEF3C7",br:"#FDE68A",tx:"#92400E",lbl:"Regular"},
  4:{bg:"#DBEAFE",br:"#BFDBFE",tx:"#1E3A8A",lbl:"Bom"},
  5:{bg:"#DCFCE7",br:"#BBF7D0",tx:"#14532D",lbl:"Excelente"},
};

const scoreColor=s=>{
  if(s===null||s===undefined)return{bg:SHEET,br:RING,tx:FAINT};
  if(s>=4.5)return{bg:"#EAF8EF",br:"#BBE7C9",tx:SUCCESS};
  if(s>=4.0)return{bg:"#E8F1F8",br:"#B7CCE0",tx:BLUE};
  if(s>=3.0)return{bg:"#FFF7E8",br:"#F3D39C",tx:WARNING};
  if(s>=2.0)return{bg:"#FFF3E6",br:"#F0BF8A",tx:WARNING};
  return{bg:"#FDECEC",br:"#F3B4AE",tx:DANGER};
};

const itemState=s=>{
  if(s===null)return"none";
  if(s>=4)return"pass";
  if(s>=2)return"flag";
  return"fail";
};

const avg=arr=>arr.length===0?null:arr.reduce((a,b)=>a+b,0)/arr.length;

// ─── Colors by area type ──────────────────────────────────────────────────────
const C_BATH="#4A3FC0",C_CLASS="#059669",C_EXT="#B45309",C_HALL="#0369A1",C_SPEC="#7C3AED",C_REST="#9333EA";

// ─── AREAS ───────────────────────────────────────────────────────────────────
const AREAS=[
  {id:"portaria1",short:"Portaria 1",label:"Portaria 1",color:C_EXT,isClassroom:false,items:[
    ["Entrada principal varrida e limpa","Sem folhas, bitucas, resíduos ou poças de água"],
    ["Pátio e jardim sem resíduos visíveis","Lixo recolhido. Calçadas desobstruídas"],
    ["Portão e guarita sem sujeira visível","Vidros, piso e superfícies da guarita limpos"],
    ["Lixeiras externas esvaziadas","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"showroom",short:"Showroom",label:"Showroom",color:C_SPEC,isClassroom:false,items:[
    ["Recepção — piso com varrição e catação realizada","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Mesas e cadeiras da recepção higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Portas e maçanetas da recepção higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Salão — piso com varrição e catação realizada","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Mesas e cadeiras do salão higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Portas e maçanetas do salão higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Árvore decorativa sem sujeira e pó","Árvore isenta de pó e qualquer sujidade"],
  ]},
  {id:"sala_ops",short:"Sala de Ops",label:"Sala de Operações",color:C_HALL,isClassroom:false,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Mesas higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"atrium_banheiro",short:"Atrium — WC",label:"Atrium — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"atrium_ext",short:"Atrium — Externo",label:"Atrium — Área externa e hall",color:C_EXT,isClassroom:false,items:[
    ["Piso da área interna varrido e catação realizada","Piso limpo, isento de qualquer tipo de sujidade"],
    ["Entrada principal varrida e limpa","Sem folhas, resíduos ou poças de água"],
    ["Pátio e jardim sem resíduos visíveis","Lixo recolhido. Calçadas desobstruídas"],
    ["Portão e guarita sem sujeira visível","Vidros, piso e superfícies da guarita limpos"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
    ["Calçada sem manchas de óleo ou resíduos","Especialmente na área de chegada de veículos"],
  ]},
  {id:"playground1",short:"Playground 1",label:"Playground 1",color:C_EXT,isClassroom:false,items:[
    ["Piso, terra e grama com varrição e catação realizada","Lixo recolhido, isento de qualquer tipo de sujidade"],
    ["Brinquedos limpos isentos de pó, terra e areia","Sem marcas de sujeiras aparente"],
    ["Portas, maçanetas e muros de vidro limpos","Sem marcas de sujeiras aparente"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"blocoa_corr",short:"Bloco A — Corredores",label:"Bloco A — Corredores e circulação",color:C_HALL,isClassroom:false,items:[
    ["Piso varrido e lavado","Sem resíduos, manchas ou marcas de pisada visíveis"],
    ["Paredes sem manchas ou riscos recentes","Marcas novas registradas e comunicadas para reparo"],
    ["Vidros e esquadrias limpos","Sem marcas de mãos, respingos ou fuligem"],
    ["Lixeiras estratégicas esvaziadas","Nunca acima de 2/3 de capacidade"],
    ["Sinalização limpa e visível","Placas sem poeira, marcas ou adesivos indevidos"],
    ["Bebedouros higienizados","Cuba, torneira e frontal sem manchas ou depósito de cal"],
  ]},
  {id:"domo_banheiro",short:"Domo — WC",label:"Domo — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"domo_ext",short:"Domo — Externo",label:"Domo — Área externa e hall",color:C_EXT,isClassroom:false,items:[
    ["Piso da área interna varrido e catação realizada","Piso limpo, isento de qualquer tipo de sujidade"],
    ["Entrada principal varrida e limpa","Sem folhas, resíduos ou poças de água"],
    ["Pátio e jardim sem resíduos visíveis","Lixo recolhido. Calçadas desobstruídas"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
    ["Calçada sem manchas de óleo ou resíduos","Especialmente na área de chegada de veículos"],
  ]},
  {id:"playground2",short:"Playground 2",label:"Playground 2",color:C_EXT,isClassroom:false,items:[
    ["Piso, terra e grama com varrição e catação realizada","Lixo recolhido, isento de qualquer tipo de sujidade"],
    ["Brinquedos limpos isentos de pó, terra e areia","Sem marcas de sujeiras aparente"],
    ["Portas, maçanetas e muros de vidro limpos","Sem marcas de sujeiras aparente"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"sala_early",short:"Early Years",label:"Salas de aula — Early Years",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"sala_reuniao",short:"Sala de Reunião",label:"Salas de Reunião",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Mesas e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"sala_toddle",short:"Toddle",label:"Salas de aula — Toddle",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"sala_trabalho",short:"Sala de Trabalho",label:"Sala de Trabalho Pequena",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Mesas e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"auditorio",short:"Auditório",label:"Auditório",color:C_SPEC,isClassroom:false,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Cadeiras limpas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"auditorio_wc",short:"Auditório — WC",label:"Auditório — Hall Piano — Banheiros",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"sala_ls",short:"Lower School",label:"Sala de aula — Lower School",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"authors_balcony",short:"Author's Balcony",label:"Author's Balcony",color:C_SPEC,isClassroom:false,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Futons limpos","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"biblioteca",short:"Biblioteca",label:"Biblioteca",color:C_SPEC,isClassroom:false,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Mesas e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"biblioteca_wc",short:"Biblioteca — WC",label:"Biblioteca — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"ls_cothinking",short:"LS Co-Thinking",label:"LS Co-Thinking",color:C_CLASS,isClassroom:false,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Mesas e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"skate_park",short:"Skate Park",label:"Skate Park",color:C_EXT,isClassroom:false,items:[
    ["Piso da área externa — varrição e catação realizada","Lixo recolhido, isento de qualquer tipo de sujidade"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"quadra_vermelha",short:"Quadra Vermelha",label:"Quadra Vermelha",color:C_EXT,isClassroom:false,items:[
    ["Piso da quadra varrido, limpo e seco — catação realizada","Sem terra, folhas, resíduos diversos ou poças de água"],
  ]},
  {id:"casa_arvore",short:"Casa da Árvore",label:"Área da Casa da Árvore e Academia",color:C_EXT,isClassroom:false,items:[
    ["Piso e grama com varrição e catação realizada","Lixo recolhido, isento de qualquer tipo de sujidade"],
    ["Brinquedos limpos isentos de pó e terra","Sem marcas de sujeiras aparente"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"quadra_society",short:"Quadra Society",label:"Quadra Society",color:C_EXT,isClassroom:false,items:[
    ["Grama da quadra varrida, limpa e seca — catação realizada","Sem terra, folhas, resíduos diversos ou poças de água"],
  ]},
  {id:"piscina",short:"Piscina",label:"Área da Piscina",color:C_HALL,isClassroom:false,items:[
    ["Piso seco — varrição e catação realizada","Piso isento de qualquer tipo de sujidade"],
    ["Limpeza dos vidros realizada","Vidro isento de manchas e sujeiras"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"vestiario_piscina",short:"Vestiário — Piscina",label:"Vestiário da Piscina",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso limpo, seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"patio_hs",short:"Pátio HS",label:"Pátio Externo High School",color:C_EXT,isClassroom:false,items:[
    ["Piso do pátio varrido — catação realizada","Piso limpo, isento de qualquer tipo de sujidade"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"sala_hs",short:"High School",label:"Salas de aula — High School",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"hs_corr",short:"HS — Hall",label:"High School — Hall, corredores e circulação",color:C_HALL,isClassroom:false,items:[
    ["Piso varrido e lavado","Sem resíduos, manchas ou marcas de pisada visíveis"],
    ["Paredes sem manchas ou riscos recentes","Marcas novas registradas e comunicadas para reparo"],
    ["Vidros e esquadrias limpos","Sem marcas de mãos, respingos ou fuligem"],
    ["Lixeiras estratégicas esvaziadas","Nunca acima de 2/3 de capacidade"],
    ["Sinalização limpa e visível","Placas sem poeira, marcas ou adesivos indevidos"],
    ["Bebedouros higienizados","Cuba, torneira e frontal sem manchas ou depósito de cal"],
  ]},
  {id:"hs_wc",short:"HS — WC",label:"High School — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"quadra_azul",short:"Quadra Azul",label:"Quadra Azul",color:C_EXT,isClassroom:false,items:[
    ["Piso da quadra varrido, limpo e seco — catação realizada","Sem terra, folhas, resíduos diversos ou poças de água"],
  ]},
  {id:"patio_middle",short:"Pátio Middle",label:"Pátio Middle",color:C_EXT,isClassroom:false,items:[
    ["Piso do pátio varrido — catação realizada","Piso limpo, isento de qualquer tipo de sujidade"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"sala_middle",short:"Middle",label:"Salas de aula — Middle",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"middle_wc",short:"Middle — WC",label:"Middle — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"patio_seniors",short:"Pátio Seniors",label:"Pátio Senior's Hub",color:C_EXT,isClassroom:false,items:[
    ["Piso do pátio varrido — catação realizada","Piso limpo, isento de qualquer tipo de sujidade"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"seniors_wc",short:"Seniors — WC",label:"Pátio Senior's Hub — Banheiros",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
  {id:"sala_seniors",short:"Seniors Hub",label:"Salas de aula — Senior's Hub",color:C_CLASS,isClassroom:true,items:[
    ["Piso varrido e sem resíduos visíveis","Nenhum papel, sujeira ou resíduo visível a olho nu"],
    ["Piso lavado / úmido passado","Piso limpo sem manchas, marcas de pisada ou resíduos"],
    ["Carteiras e cadeiras higienizadas","Superfícies sem poeira, marcas ou resíduos"],
    ["Lixeiras esvaziadas e com saco limpo","Lixeira nunca acima de 2/3 de capacidade ao início da aula"],
    ["Portas e maçanetas higienizadas","Sem marcas de dedo, oleosidade ou manchas visíveis"],
    ["Janelas e persianas sem poeira acumulada","Persianas abertas não revelam acúmulo de poeira"],
  ]},
  {id:"quadra_pickleball",short:"Pickleball",label:"Quadra Pickleball",color:C_EXT,isClassroom:false,items:[
    ["Piso da quadra varrido, limpo e seco — catação realizada","Sem terra, folhas, resíduos diversos ou poças de água"],
  ]},
  {id:"quadra_foursquare",short:"Foursquare",label:"Quadra Foursquare",color:C_EXT,isClassroom:false,items:[
    ["Piso da quadra varrido, limpo e seco — catação realizada","Sem terra, folhas, resíduos diversos ou poças de água"],
  ]},
  {id:"estacionamento",short:"Estacionamento",label:"Estacionamento",color:C_EXT,isClassroom:false,items:[
    ["Piso de área externa — varrição e catação realizada","Lixo recolhido, isento de qualquer tipo de sujidade"],
    ["Lixeiras externas esvaziadas diariamente","Nunca acima de 2/3 de capacidade em nenhum horário"],
  ]},
  {id:"refeitorio",short:"Refeitório",label:"Refeitório",color:C_REST,isClassroom:false,items:[
    ["Mesas higienizadas entre turnos","Sem resíduos, manchas ou umidade após cada refeição"],
    ["Cadeiras limpas e sem resíduos embaixo","Incluindo pés das cadeiras e embaixo das mesas"],
    ["Piso varrido e lavado após cada refeição","Sem resíduos de alimento em nenhum ponto do piso"],
    ["Estações de higiene abastecidas","Álcool gel, papel e dispenser funcionando"],
    ["Lixeiras separadas: orgânico e reciclável","Identificadas e com sacos limpos após cada turno"],
    ["Bancadas de apoio higienizadas","Sem resíduos, manchas ou utensílios abandonados"],
  ]},
  {id:"refeitorio_wc",short:"Refeitório — WC",label:"Refeitório — Banheiros e sanitários",color:C_BATH,isClassroom:false,items:[
    ["Vasos e assentos higienizados","Sem manchas, resíduos ou odor. Assento sem dano visível"],
    ["Pias e torneiras sem manchas de cal ou sabão","Superfície brilhante. Torneira sem vazamento"],
    ["Espelhos limpos e sem marcas","Sem manchas de água, sabão ou dedos"],
    ["Piso seco e sem poças","Nenhum risco de escorregamento. Ralos desobstruídos"],
    ["Dispensers de sabão e papel abastecidos","Nunca vazios durante o horário de funcionamento"],
    ["Lixeiras fechadas e com saco limpo","Tampa funcionando. Saco sem extravasamento"],
    ["Ausência de odor desagradável","Ambiente ventilado e sem odor perceptível"],
  ]},
];

const SLOTS=[
  {id:"0700",time:"07:00",label:"Abertura",           classroomsIncluded:true },
  {id:"1130",time:"11:30",label:"Intervalo do almoço",classroomsIncluded:false},
  {id:"1430",time:"14:30",label:"Intervalo da tarde", classroomsIncluded:false},
  {id:"1630",time:"16:30",label:"Encerramento",       classroomsIncluded:true },
];

const areasForSlot=slot=>AREAS.filter(a=>slot.classroomsIncluded||!a.isClassroom);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todaySP=()=>{
  const d=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"}));
  return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmtDate=s=>{
  const[y,m,d]=s.split("-");
  return`${parseInt(d)} ${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][parseInt(m)-1]} ${y}`;
};
const fmtShort=s=>{const[,m,d]=s.split("-");return`${parseInt(d)}/${m}`;};
const weeksAgo=n=>{const d=new Date();d.setDate(d.getDate()-n*7);return d.toISOString().split("T")[0];};
const startOfWeek=d=>{const dt=new Date(d+"T12:00:00");dt.setDate(dt.getDate()-dt.getDay());return dt.toISOString().split("T")[0];};

const emptyAudit=()=>({
  areas:Object.fromEntries(AREAS.map(a=>[a.id,{items:Array(a.items.length).fill(null),notes:"",photo:null,roomNumber:""}]))
});

function resizePhoto(file){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=800;let w=img.width,h=img.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
        const canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL("image/jpeg",0.6));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const Q_KEY="ec_q_v5",LH_KEY="ec_lh_v5";
const qLoad=()=>{try{return JSON.parse(localStorage.getItem(Q_KEY)||"[]");}catch{return[];}};
const qSave=q=>{try{localStorage.setItem(Q_KEY,JSON.stringify(q));}catch{}};
const qAdd=e=>{const q=qLoad();q.push(e);qSave(q);};
const lhLoad=()=>{try{return JSON.parse(localStorage.getItem(LH_KEY)||"[]");}catch{return[];}};
const lhSave=h=>{try{localStorage.setItem(LH_KEY,JSON.stringify(h.slice(0,200)));}catch{}};

async function saveToSheets(entry){
  if(!SHEETS_ON)return false;
  const slot=SLOTS.find(s=>s.id===entry.slotId);
  const audited=slot?areasForSlot(slot):AREAS;
  const rows=audited.map(a=>({
    id:entry.id,campus:"SP",date:entry.date,slot_id:entry.slotId,slot_label:entry.slotLabel,
    auditor:entry.auditor,area_id:a.id,area_label:a.label,
    room_number:entry.areas[a.id]?.roomNumber||"",
    area_score:(()=>{const it=(entry.areas[a.id]?.items||[]).filter(s=>s!==null);return it.length?parseFloat(avg(it).toFixed(2)):null;})(),
    overall_score:parseFloat(entry.overallScore.toFixed(2)),
    notes:entry.areas[a.id]?.notes||"",
    photo_data:entry.areas[a.id]?.photo||null,
    created_at:new Date().toISOString(),
  }));
  await fetch(SHEETS_URL,{method:"POST",mode:"no-cors",body:JSON.stringify({rows})});
  return true;
}

async function syncQueue(){
  if(!SHEETS_ON)return 0;
  const q=qLoad();if(!q.length)return 0;
  let ok=0;const rem=[];
  for(const e of q){try{await saveToSheets(e);ok++;}catch{rem.push(e);}}
  qSave(rem);return ok;
}

// ─── Design components ────────────────────────────────────────────────────────

// Pill badge
function Pill({children, tone="neutral"}){
  const t={
    neutral:{bg:SHEET,color:MUTED,border:RING},
    dark:   {bg:INK,  color:"#fff",border:INK},
    good:   {bg:"#DCFCE7",color:"#065F46",border:"#BBF7D0"},
    warn:   {bg:"#FEF3C7",color:"#92400E",border:"#FDE68A"},
    bad:    {bg:"#FEE2E2",color:"#991B1B",border:"#FECACA"},
    yellow: {bg:YELLOW,color:INK,border:YELLOW},
  }[tone]||{bg:SHEET,color:MUTED,border:RING};
  return(
    <span style={{display:"inline-flex",alignItems:"center",padding:"5px 12px",borderRadius:99,border:`1px solid ${t.border}`,background:t.bg,color:t.color,fontSize:14,fontWeight:900,letterSpacing:"0.01em",lineHeight:1.2,boxShadow:"0 1px 2px rgba(15,23,42,.05)"}}>
      {children}
    </span>
  );
}

// Score ring SVG
function ScoreRing({score,size=100}){
  const r=38,circ=2*Math.PI*r;
  const offset=circ-(score/5)*circ;
  const col=score>=4?"#10B981":score>=3?"#F59E0B":"#F43F5E";
  return(
    <div style={{position:"relative",width:size,height:size,display:"grid",placeItems:"center"}}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{transform:"rotate(-90deg)"}} aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="10"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={col} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{transition:"stroke-dashoffset .5s ease"}}/>
      </svg>
      <div style={{position:"absolute",textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:size>90?28:20,fontWeight:900,letterSpacing:"-0.04em",lineHeight:1}}>{score.toFixed(1)}</div>
        <div style={{fontSize:14,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",opacity:.55,marginTop:2}}>nota</div>
      </div>
    </div>
  );
}

// Item state icon
function StateIcon({state}){
  const cfg={
    pass:{bg:"#DCFCE7",color:"#065F46",symbol:"✓"},
    flag:{bg:"#FEF3C7",color:"#92400E",symbol:"!"},
    fail:{bg:"#FEE2E2",color:"#991B1B",symbol:"✗"},
    none:{bg:SHEET,    color:FAINT,    symbol:"·"},
  }[state]||{bg:SHEET,color:FAINT,symbol:"·"};
  return(
    <div style={{width:38,height:38,borderRadius:12,background:cfg.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,fontWeight:900,color:cfg.color,border:`1px solid ${cfg.color}20`}}>
      {cfg.symbol}
    </div>
  );
}

// Score buttons row
function ScoreRow({value,onChange}){
  const labels={
    0:"0 · Crítico",
    1:"1 · Muito abaixo",
    2:"2 · Abaixo do esperado",
    3:"3 · Regular",
    4:"4 · Adequado",
    5:"5 · Excelente",
  };
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {[0,1,2,3,4,5].map(s=>{
        const c=SC[s];const on=value===s;
        return <button key={s} className="score-btn" onClick={()=>onChange(s)}
          style={{background:on?c.bg:PAPER,borderColor:on?c.tx:RING,color:on?c.tx:MUTED,fontWeight:900,boxShadow:on?`0 0 0 3px ${c.br}66, 0 10px 20px ${c.br}55`:"0 1px 0 rgba(17,24,39,.04)",transform:on?"translateY(-1px)":"none"}}>{labels[s]}</button>;
      })}
    </div>
  );
}

// Photo capture button
function PhotoCapture({photo,onPhoto,color}){
  const ref=useRef();
  const handleFile=async e=>{
    const f=e.target.files[0];if(!f)return;
    const b64=await resizePhoto(f);onPhoto(b64);
  };
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handleFile}/>
      {photo?(
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src={photo} onClick={()=>ref.current.click()} alt="foto"
            style={{width:56,height:56,borderRadius:12,objectFit:"cover",border:`2px solid ${color}`,cursor:"pointer"}}/>
          <div>
            <p style={{fontSize:14,fontWeight:700,color,marginBottom:3}}>Foto anexada</p>
            <button onClick={()=>ref.current.click()}
              style={{fontSize:14,color:MUTED,background:SHEET,border:`1px solid ${RING}`,borderRadius:10,padding:"8px 14px",minHeight:44,fontFamily:"inherit",cursor:"pointer"}}>
              Trocar
            </button>
          </div>
        </div>
      ):(
        <button onClick={()=>ref.current.click()}
          style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",borderRadius:12,
            border:`1.5px dashed ${RING}`,background:"transparent",color:MUTED,
            fontSize:14,fontWeight:600,fontFamily:"inherit",cursor:"pointer",minHeight:44}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Adicionar foto
        </button>
      )}
    </div>
  );
}

// Card wrapper
function Card({children, pad="1.1rem 1.25rem", radius=24, style={}, onClick}){
  return(
    <div onClick={onClick} style={{background:PAPER,borderRadius:radius,padding:pad,boxShadow:SOFT_SHADOW,border:`1px solid rgba(226,232,240,.95)`,...style}}>
      {children}
    </div>
  );
}

function MetricCard({label,value,tone="neutral"}){
  const palette={
    neutral:{bg:PAPER,tx:INK,border:RING},
    blue:{bg:SOFT_BLUE,tx:BLUE,border:"#C9DCEB"},
    warn:{bg:"#FFF7E8",tx:WARNING,border:"#F3D39C"},
    danger:{bg:"#FDECEC",tx:DANGER,border:"#F3B4AE"},
    good:{bg:"#EAF8EF",tx:SUCCESS,border:"#BBE7C9"},
  }[tone]||{bg:PAPER,tx:INK,border:RING};
  return(
    <div style={{background:palette.bg,border:`1px solid ${palette.border}`,borderRadius:20,padding:"13px 12px",minHeight:86}}>
      <p style={{fontSize:14,fontWeight:800,color:MUTED,lineHeight:1.25,marginBottom:8}}>{label}</p>
      <p style={{fontSize:26,fontWeight:900,color:palette.tx,letterSpacing:"-0.05em",lineHeight:1}}>{value}</p>
    </div>
  );
}

function BottomNav({active,onAudit,onAreas,onIndicadores}){
  const items=[
    ["Auditoria",onAudit],
    ["Áreas",onAreas],
    ["Indicadores",onIndicadores],
    ["Fornecedores",null],
    ["Ajustes",null],
  ];
  return(
    <div style={{position:"sticky",bottom:0,zIndex:30,background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,borderTop:`1px solid ${GLASS_BORDER}`,boxShadow:"0 -18px 42px rgba(17,24,39,.12)",padding:"9px 8px calc(11px + env(safe-area-inset-bottom))",display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
      {items.map(([label,handler])=>{
        const selected=active===label;
        return(
          <button key={label} onClick={handler||undefined} disabled={!handler}
            style={{minHeight:48,border:selected?`1px solid ${GLASS_BORDER}`:"1px solid transparent",borderRadius:16,background:selected?GLASS_BLUE:"transparent",color:selected?BLUE:handler?MUTED:FAINT,fontSize:14,fontWeight:selected?900:800,cursor:handler?"pointer":"default",padding:"6px 4px",lineHeight:1.15,boxShadow:selected?"0 8px 18px rgba(31,78,121,.10)":"none"}}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Dark card
function DarkCard({children, pad="1.25rem", radius=26, style={}}){
  return(
    <div style={{background:DARK_BLUE,borderRadius:radius,padding:pad,boxShadow:"0 18px 42px rgba(17,24,39,.22)",border:"1px solid rgba(255,255,255,.08)",...style}}>
      {children}
    </div>
  );
}

// ─── Tela: Nome ───────────────────────────────────────────────────────────────
function NameScreen({onSet}){
  const[name,setName]=useState(()=>localStorage.getItem("ec_auditor")||"");
  return(
    <div className="au" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"2rem 1.25rem"}}>
      <div style={{marginBottom:"1.75rem",textAlign:"center"}}>
        <div style={{width:58,height:58,borderRadius:18,background:YELLOW,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1.25rem",boxShadow:"0 14px 28px rgba(245,194,0,.28)"}}>
          <span style={{fontSize:16,fontWeight:900,color:INK,letterSpacing:"-0.03em"}}>EC</span>
        </div>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 15px",borderRadius:99,background:INK,marginBottom:16,boxShadow:"0 10px 24px rgba(15,23,42,.16)"}}>
          <span style={{fontSize:14,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.15em"}}>Auditoria de Espaços</span>
        </div>
        <h1 style={{fontSize:36,fontWeight:900,color:INK,letterSpacing:"-0.05em",lineHeight:1.05,marginBottom:10}}>Escola Concept<br/>São Paulo</h1>
        <p style={{fontSize:15,color:MUTED,lineHeight:1.55}}>Qualidade operacional · Ciclo 2026</p>
      </div>
      <div style={{width:"100%",maxWidth:340,background:PAPER,border:`1px solid ${RING}`,borderRadius:26,padding:"1rem",boxShadow:SHADOW}}>
        <p style={{fontSize:14,fontWeight:700,color:FAINT,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:8}}>Seu nome</p>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onSet(name.trim())}
          placeholder="ex: Ana Lima"
          style={{width:"100%",fontSize:15,fontWeight:500,padding:"14px 16px",border:`1.5px solid ${RING}`,borderRadius:14,background:PAPER,color:INK,marginBottom:12}}/>
        <button onClick={()=>name.trim()&&onSet(name.trim())} className="btn-scale"
          disabled={!name.trim()}
          style={{width:"100%",padding:"15px",borderRadius:14,border:"none",fontFamily:"inherit",
            fontSize:16,fontWeight:900,letterSpacing:"0.01em",minHeight:50,boxShadow:name.trim()?"0 12px 24px rgba(15,23,42,.18)":"none",
            background:name.trim()?INK:"#E2E8F0",
            color:name.trim()?"#fff":FAINT,cursor:name.trim()?"pointer":"default"}}>
          Entrar →
        </button>
        {!SHEETS_ON&&(
          <p style={{marginTop:12,fontSize:14,color:FAINT,textAlign:"center",lineHeight:1.65}}>
            Dados salvos neste dispositivo.<br/>Configure VITE_SHEETS_URL para persistir na planilha.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tela: Home ───────────────────────────────────────────────────────────────
function HomeScreen({date,history,auditor,onStart,onView,onDashboard,onHistory,pending}){
  const dayAudits=history.filter(a=>a.date===date);
  const dayAvg=avg(dayAudits.map(a=>a.overallScore).filter(Boolean));
  const alerts=dayAudits.filter(a=>a.overallScore<4).length;
  const completedSlots=dayAudits.length;
  const completionPct=Math.round((completedSlots/SLOTS.length)*100);
  const nextSlot=SLOTS.find(s=>!dayAudits.some(a=>a.slotId===s.id))||SLOTS[SLOTS.length-1];
  const criticalFindings=dayAudits.reduce((total,aud)=>{
    const slot=SLOTS.find(s=>s.id===aud.slotId);
    return total+areasForSlot(slot).flatMap(area=>aud.areas?.[area.id]?.items||[]).filter(s=>s!==null&&s<2).length;
  },0);
  const pendingAreas=SLOTS.filter(s=>!dayAudits.some(a=>a.slotId===s.id)).reduce((total,s)=>total+areasForSlot(s).length,0);
  const vendorActions=dayAudits.reduce((total,aud)=>{
    const slot=SLOTS.find(s=>s.id===aud.slotId);
    const hasIssue=areasForSlot(slot).some(area=>(aud.areas?.[area.id]?.items||[]).some(s=>s!==null&&s<4));
    return total+(hasIssue?1:0);
  },0);

  return(
    <div className="au" style={{paddingBottom:10}}>
      {/* Nav */}
      <div style={{padding:"1.1rem 1rem 0",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:2}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:44,height:44,borderRadius:16,background:SOFT_BLUE,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 8px 18px rgba(31,78,121,.12)",border:`1px solid #C9DCEB`}}>
            <span style={{fontSize:14,fontWeight:900,color:BLUE}}>EC</span>
          </div>
          <div>
            <p style={{fontSize:14,fontWeight:800,color:BLUE,lineHeight:1.2}}>Inteligência de Facilities</p>
            <p style={{fontSize:14,fontWeight:600,color:MUTED,lineHeight:1.35,marginTop:2}}>Campus São Paulo · {fmtDate(date)}</p>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
          {pending>0&&<Pill tone="warn">{pending} pendente{pending>1?"s":""}</Pill>}
          <span style={{fontSize:14,fontWeight:800,color:INK,textAlign:"right"}}>{auditor}</span>
        </div>
      </div>

      <div style={{padding:"1rem",display:"flex",flexDirection:"column",gap:16}}>
        {/* Hero dark card */}
        <DarkCard pad="1.35rem" radius={30}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14,marginBottom:"1.1rem"}}>
            <div>
              <p style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.55)",lineHeight:1.25,marginBottom:8}}>Auditoria de Facilities · Campus São Paulo</p>
              <h2 style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-0.05em",lineHeight:1.02,marginBottom:8}}>Rodada de hoje</h2>
              <p style={{fontSize:15,color:"rgba(255,255,255,.68)",lineHeight:1.45}}>Próxima janela: {nextSlot.time} · {nextSlot.label}</p>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <p style={{fontSize:38,fontWeight:900,color:"#fff",letterSpacing:"-0.06em",lineHeight:.95}}>{completionPct}%</p>
              <p style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.55)",marginTop:5}}>concluída</p>
            </div>
          </div>
          <div style={{height:9,borderRadius:99,background:"rgba(255,255,255,.12)",overflow:"hidden",marginBottom:14}}>
            <div style={{width:`${completionPct}%`,height:"100%",borderRadius:99,background:YELLOW}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9}}>
            {[
              [`${completedSlots}/4`,"auditorias concluídas"],
              [criticalFindings||"0","ocorrências críticas"],
              [pendingAreas||"0","áreas pendentes"],
              [vendorActions||"0","ações com fornecedor"],
            ].map(([v,l])=>(
              <div key={l} style={{background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,padding:"13px 11px 11px"}}>
                <p style={{fontSize:24,fontWeight:900,color:"#fff",letterSpacing:"-0.04em",lineHeight:1}}>{v}</p>
                <p style={{fontSize:14,color:"rgba(255,255,255,.58)",marginTop:6,lineHeight:1.25}}>{l}</p>
              </div>
            ))}
          </div>
        </DarkCard>

        {pending>0&&(
          <Card radius={24} style={{background:"#FFF7E8",border:"1px solid #F3D39C",boxShadow:"0 12px 28px rgba(180,83,9,.08)"}}>
            <p style={{fontSize:16,fontWeight:900,color:WARNING,letterSpacing:"-0.02em",lineHeight:1.25}}>Envio pendente</p>
            <p style={{fontSize:14,color:"#92400E",lineHeight:1.5,marginTop:6}}>
              Há {pending} registro{pending>1?"s":""} aguardando sincronização quando a conexão estiver disponível.
            </p>
          </Card>
        )}

        {/* Slots */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div>
            <p style={{fontSize:20,fontWeight:900,color:INK,letterSpacing:"-0.04em",lineHeight:1.15}}>Áreas e rodadas</p>
            <p style={{fontSize:14,color:MUTED,lineHeight:1.4,marginTop:2}}>Escolha uma rodada para auditar ou revisar.</p>
          </div>
          <Pill tone={SHEETS_ON?"good":"neutral"}>{SHEETS_ON?"Planilha ativa":"Modo local"}</Pill>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {SLOTS.map(slot=>{
            const done=dayAudits.find(a=>a.slotId===slot.id);
            const sc_=done?scoreColor(done.overallScore):null;
            const areaCount=areasForSlot(slot).length;
            const status=done?done.overallScore>=4?"Resolvido":"Ação do fornecedor":"Pendente";
            return(
              <Card key={slot.id} pad="0" radius={24}
                style={{overflow:"hidden",cursor:"pointer",border:`1px solid ${done?sc_.br:RING}`,boxShadow:done?"0 12px 30px rgba(15,23,42,.08)":SOFT_SHADOW}}
                onClick={()=>done?onView(done):onStart(slot)}>
                <div className="tap" style={{display:"flex",alignItems:"center",gap:0}}>
                  {/* Left color bar */}
                  <div style={{width:6,alignSelf:"stretch",background:done?(done.overallScore>=4?"#10B981":done.overallScore>=3?"#F59E0B":"#F43F5E"):"#CBD5E1",borderRadius:"24px 0 0 24px",flexShrink:0}}/>
                  <div style={{display:"flex",alignItems:"center",gap:14,flex:1,padding:"16px 15px 16px 13px"}}>
                    {/* Score badge */}
                    <div style={{width:52,height:52,borderRadius:16,flexShrink:0,
                      background:done?sc_.bg:SHEET,border:`1.5px solid ${done?sc_.br:RING}`,
                      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:done?"0 6px 16px rgba(15,23,42,.06)":"none"}}>
                      {done?(
                        <><span style={{fontSize:16,fontWeight:900,color:sc_.tx,lineHeight:1}}>{done.overallScore.toFixed(1)}</span>
                        <span style={{fontSize:14,color:sc_.tx,opacity:.6}}>/5</span></>
                      ):(
                        <span style={{fontSize:14,color:FAINT,fontWeight:700}}>—</span>
                      )}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                        <p style={{fontSize:20,fontWeight:900,color:INK,letterSpacing:"-0.03em",lineHeight:1}}>{slot.time}</p>
                        <Pill tone={done?done.overallScore>=4?"good":"warn":"neutral"}>{status}</Pill>
                      </div>
                      <p style={{fontSize:15,color:INK2,lineHeight:1.35,fontWeight:800}}>{slot.label}</p>
                      <p style={{fontSize:14,color:MUTED,marginTop:4,lineHeight:1.35}}>
                        {!slot.classroomsIncluded?"Salas excluídas · ":""}{areaCount} áreas
                      </p>
                    </div>
                    {done?(
                      <Pill tone={done.overallScore>=4?"good":"bad"}>
                        {done.overallScore>=4?"Adequado":"Requer atenção"}
                      </Pill>
                    ):(
                      <button style={{border:"none",background:BLUE,color:"#fff",borderRadius:16,padding:"12px 14px",fontSize:16,fontWeight:900,cursor:"pointer",boxShadow:"0 10px 18px rgba(31,78,121,.18)",minHeight:44}}>Auditar</button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Nav buttons */}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={onHistory}
            style={{flex:1,padding:"14px 12px",minHeight:48,borderRadius:16,border:`1px solid ${RING}`,background:PAPER,color:MUTED,fontSize:14,fontWeight:800,fontFamily:"inherit",cursor:"pointer",boxShadow:SOFT_SHADOW}}>
            Áreas
          </button>
          <button onClick={onDashboard} className="btn-scale"
            style={{flex:2,padding:"14px 12px",minHeight:50,borderRadius:16,border:"none",background:INK,color:"#fff",fontSize:14,fontWeight:900,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.01em",boxShadow:"0 14px 28px rgba(15,23,42,.22)"}}>
            Indicadores
          </button>
        </div>
      </div>
      <BottomNav active="Auditoria" onAudit={()=>{}} onAreas={onHistory} onIndicadores={onDashboard}/>
    </div>
  );
}

// ─── Tela: Auditoria ──────────────────────────────────────────────────────────
function AuditScreen({slot,areaIdx,audit,onScore,onNotes,onPhoto,onRoomNumber,onNext,onPrev,onDone}){
  const activeAreas=areasForSlot(slot);
  const area=activeAreas[areaIdx];
  const aData=audit.areas[area.id];
  const scored=aData.items.filter(s=>s!==null).length;
  const allDone=scored===area.items.length;
  const isLast=areaIdx===activeAreas.length-1;
  const prevScores=activeAreas.slice(0,areaIdx).map(a=>{const it=audit.areas[a.id].items.filter(s=>s!==null);return it.length?avg(it):null;});
  const areaScore=scored?avg(aData.items.filter(s=>s!==null)):null;
  const areaStatus=areaScore===null?"Pendente":areaScore>=4?"Adequado":areaScore>=2?"Requer atenção":"Crítico";
  const areaTone=areaScore===null?"neutral":areaScore>=4?"good":areaScore>=2?"warn":"bad";

  return(
    <div className="au" style={{paddingBottom:104}}>
      {/* Header */}
      <div style={{background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,borderBottom:`1px solid ${GLASS_BORDER}`,padding:"0.95rem 1rem 0.85rem",boxShadow:"0 12px 30px rgba(17,24,39,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={onPrev}
            style={{width:44,height:44,borderRadius:14,background:SHEET,border:`1px solid ${RING}`,color:INK,cursor:"pointer",fontSize:17,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 12px rgba(15,23,42,.05)"}}>
            ←
          </button>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:14,color:FAINT,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3,lineHeight:1.25}}>
              {slot.time} {slot.label} · {areaIdx+1} de {activeAreas.length}
            </p>
            <p style={{fontSize:17,fontWeight:900,color:INK,letterSpacing:"-0.03em",lineHeight:1.22}}>{area.label}</p>
          </div>
          {/* Room number for classrooms */}
          {area.isClassroom&&(
            <div style={{background:INK,borderRadius:14,padding:"7px 11px",flexShrink:0,boxShadow:"0 8px 18px rgba(15,23,42,.18)"}}>
              <p style={{fontSize:14,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>Sala nº</p>
              <input value={aData.roomNumber} onChange={e=>onRoomNumber(area.id,e.target.value)}
                placeholder="201"
                style={{width:48,background:"transparent",border:"none",color:"#fff",fontSize:14,fontWeight:900,fontFamily:"inherit",padding:0}}/>
            </div>
          )}
        </div>
        {/* Step progress */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center",marginBottom:12}}>
          <div style={{background:SOFT_BLUE,border:"1px solid #C9DCEB",borderRadius:20,padding:"12px 13px"}}>
            <p style={{fontSize:14,fontWeight:800,color:BLUE,lineHeight:1.2,marginBottom:4}}>Área em auditoria</p>
            <p style={{fontSize:16,fontWeight:900,color:INK,letterSpacing:"-0.02em",lineHeight:1.2}}>{area.short}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <Pill tone={areaTone}>{areaStatus}</Pill>
            <p style={{fontSize:22,fontWeight:900,color:areaScore===null?FAINT:scoreColor(areaScore).tx,letterSpacing:"-0.04em",lineHeight:1,marginTop:8}}>{areaScore!==null?areaScore.toFixed(1):"—"}</p>
          </div>
        </div>
        <div style={{display:"flex",gap:4}}>
          {activeAreas.map((_,i)=>(
            <div key={i} style={{flex:1,height:5,borderRadius:99,
              background:i<areaIdx?"#10B981":i===areaIdx?area.color:"#E2E8F0",
              transition:"background .2s"}}/>
          ))}
        </div>
        <p style={{fontSize:14,color:MUTED,fontWeight:700,marginTop:8,lineHeight:1.35}}>{scored} de {area.items.length} itens pontuados</p>
      </div>

      {/* Items */}
      <div style={{padding:"0.9rem 1rem",display:"flex",flexDirection:"column",gap:11}}>
        {area.items.map(([item,padrao],i)=>{
          const s=aData.items[i];
          const state=itemState(s);
          const c=s!==null?SC[s]:null;
          return(
            <Card key={i} pad="15px 15px" radius={24}
              style={{background:s!==null?c.bg:PAPER,border:`1px solid ${s!==null?c.br:RING}`,transition:"background .18s, border-color .18s",boxShadow:s!==null?`0 12px 28px ${c.br}33`:SOFT_SHADOW}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                <StateIcon state={state}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:16,fontWeight:900,color:s!==null?c.tx:INK,lineHeight:1.32,letterSpacing:"-0.02em"}}>{item}</p>
                  <p style={{fontSize:14,color:s!==null?c.tx:MUTED,lineHeight:1.55,marginTop:6,opacity:s!==null?.78:1}}>{padrao}</p>
                </div>
                {s!==null&&<span style={{fontSize:14,fontWeight:700,padding:"3px 9px",borderRadius:99,background:`${c.tx}18`,color:c.tx,flexShrink:0,lineHeight:1.2}}>{SC[s].lbl}</span>}
              </div>
              <ScoreRow value={s} onChange={v=>onScore(area.id,i,v)}/>
            </Card>
          );
        })}

        {/* Notes + photo */}
        <Card pad="15px" radius={24}>
          <p style={{fontSize:14,fontWeight:800,color:BLUE,marginBottom:8}}>Observações e evidências</p>
          <textarea value={aData.notes} onChange={e=>onNotes(area.id,e.target.value)}
            placeholder="Não conformidades específicas, responsável, detalhes…" rows={2}
            style={{width:"100%",fontSize:14,lineHeight:1.6,padding:"12px 13px",border:`1.5px solid ${RING}`,borderRadius:16,background:SHEET,color:INK,resize:"none"}}/>
          <PhotoCapture photo={aData.photo} onPhoto={b64=>onPhoto(area.id,b64)} color={area.color}/>
        </Card>

        {/* Previous area chips */}
        {areaIdx>0&&(
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {activeAreas.slice(0,Math.min(areaIdx,6)).map((a,i)=>{const c=scoreColor(prevScores[i]);return(
              <span key={a.id} style={{fontSize:14,fontWeight:700,padding:"4px 10px",borderRadius:99,background:c.bg,color:c.tx,border:`1px solid ${c.br}`,lineHeight:1.25}}>
                {a.short}{audit.areas[a.id]?.roomNumber?` #${audit.areas[a.id].roomNumber}`:""}: {prevScores[i]?prevScores[i].toFixed(1):"—"}
              </span>
            );})}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div style={{position:"sticky",bottom:0,left:0,right:0,background:"rgba(15,23,42,.96)",padding:"13px 1rem calc(13px + env(safe-area-inset-bottom))",boxShadow:"0 -12px 32px rgba(15,23,42,.25)",borderTop:"1px solid rgba(255,255,255,.08)"}}>
        <button className="btn-scale" onClick={isLast?onDone:onNext} disabled={!allDone}
          style={{width:"100%",padding:"15px",borderRadius:18,border:"none",fontFamily:"inherit",
            fontSize:16,fontWeight:900,letterSpacing:"0.01em",cursor:allDone?"pointer":"default",minHeight:48,
            background:allDone?YELLOW:"rgba(255,255,255,.1)",
            color:allDone?INK:"rgba(255,255,255,.35)",transition:"background .18s",boxShadow:allDone?"0 12px 24px rgba(245,194,0,.22)":"none"}}>
          {!allDone
            ?`Pontue ${area.items.length-scored} item${area.items.length-scored>1?"s":""} restante${area.items.length-scored>1?"s":""}…`
            :isLast?"Concluir auditoria →":`Próxima: ${activeAreas[areaIdx+1].short} →`}
        </button>
      </div>
    </div>
  );
}

// ─── Tela: Resumo ─────────────────────────────────────────────────────────────
function SummaryScreen({auditData,onHome,onNewAudit}){
  const{slotId,date,areas,overallScore,auditor}=auditData;
  const slot=SLOTS.find(s=>s.id===slotId)||{time:"",label:""};
  const activeAreas=areasForSlot(slot);
  const areaScores=activeAreas.map(a=>{
    const it=(areas[a.id]?.items||[]).filter(s=>s!==null);
    return{...a,score:it.length?avg(it):null,notes:areas[a.id]?.notes||"",photo:areas[a.id]?.photo||null,room:areas[a.id]?.roomNumber||""};
  });
  const issues=activeAreas.flatMap(a=>(areas[a.id]?.items||[]).map((sc_,i)=>({area:a.short,room:areas[a.id]?.roomNumber||"",areaColor:a.color,item:a.items[i][0],score:sc_}))).filter(x=>x.score!==null&&x.score<4);
  const passed=overallScore>=4.0;
  const urgent=overallScore<3.0||issues.some(x=>x.score<2);
  const[viewPhoto,setViewPhoto]=useState(null);

  return(
    <div className="au">
      {viewPhoto&&(
        <div onClick={()=>setViewPhoto(null)}
          style={{position:"absolute",top:0,left:0,right:0,minHeight:"100%",background:"rgba(15,23,42,.9)",
            display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:100,cursor:"pointer",padding:"2rem 1rem"}}>
          <img src={viewPhoto} style={{width:"100%",maxWidth:420,borderRadius:16,objectFit:"contain"}}/>
        </div>
      )}

      {/* Hero */}
      <DarkCard radius={0} pad="0" style={{background:passed?"#064E3B":"#7F1D1D",boxShadow:"0 18px 42px rgba(15,23,42,.22)"}}>
        <div style={{padding:"1.45rem 1.1rem 1.3rem"}}>
          <p style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,lineHeight:1.3}}>
            SP · {slot.time} {slot.label} · {fmtDate(date)}
          </p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <p style={{fontSize:14,color:"rgba(255,255,255,.5)",marginBottom:4,lineHeight:1.35}}>{passed?"Padrão atingido":"Abaixo do padrão mínimo"}</p>
              <p style={{fontSize:54,fontWeight:900,color:"#fff",letterSpacing:"-0.06em",lineHeight:.94}}>{overallScore.toFixed(1)}</p>
              <p style={{fontSize:14,color:"rgba(255,255,255,.55)",marginTop:5,lineHeight:1.35}}>{passed?"✓ Meta de 4,0 cumprida":"⚠ Ação necessária"}</p>
            </div>
            <ScoreRing score={overallScore} size={96}/>
          </div>
          <div style={{marginTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div style={{background:"rgba(255,255,255,.16)",backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,border:"1px solid rgba(255,255,255,.20)",borderRadius:22,padding:"12px",boxShadow:"0 12px 26px rgba(17,24,39,.10)"}}>
              <p style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.58)",lineHeight:1.25}}>Registro</p>
              <p style={{fontSize:16,fontWeight:900,color:"#fff",lineHeight:1.25,marginTop:4}}>Auditoria concluída</p>
            </div>
            <div style={{background:"rgba(255,255,255,.16)",backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,border:"1px solid rgba(255,255,255,.20)",borderRadius:22,padding:"12px",boxShadow:"0 12px 26px rgba(17,24,39,.10)"}}>
              <p style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.58)",lineHeight:1.25}}>Persistência</p>
              <p style={{fontSize:16,fontWeight:900,color:"#fff",lineHeight:1.25,marginTop:4}}>{SHEETS_ON?"Planilha ativa":"Modo local"}</p>
            </div>
          </div>
        </div>
      </DarkCard>

      <div style={{padding:"1rem",display:"flex",flexDirection:"column",gap:12}}>
        {/* Area scores */}
        <p style={{fontSize:14,fontWeight:700,color:FAINT,textTransform:"uppercase",letterSpacing:"0.14em"}}>Notas por área</p>
        <Card pad="0" radius={24} style={{overflow:"hidden"}}>
          {areaScores.map((a,i)=>{
            const c=scoreColor(a.score);
            return(
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:0,borderBottom:i<areaScores.length-1?`1px solid ${RING}`:"none"}}>
                <div style={{width:5,alignSelf:"stretch",background:a.color,flexShrink:0}}/>
                <div style={{display:"flex",alignItems:"center",gap:11,flex:1,padding:"12px 13px"}}>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:INK,minWidth:0,lineHeight:1.35}}>
                    {a.short}{a.room?<span style={{color:FAINT,fontWeight:400}}> #{a.room}</span>:null}
                  </span>
                  {a.photo&&(
                    <button onClick={()=>setViewPhoto(a.photo)} style={{width:44,height:44,background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <img src={a.photo} style={{width:34,height:34,borderRadius:10,objectFit:"cover",border:`1px solid ${RING}`,boxShadow:"0 4px 10px rgba(15,23,42,.08)"}}/>
                    </button>
                  )}
                  <span style={{fontSize:14,fontWeight:900,padding:"4px 12px",borderRadius:99,background:c.bg,color:c.tx,border:`1px solid ${c.br}`,flexShrink:0,lineHeight:1.2}}>
                    {a.score!==null?a.score.toFixed(1):"—"}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Issues */}
        {issues.length>0&&(
          <>
            <p style={{fontSize:14,fontWeight:700,color:"#92400E",textTransform:"uppercase",letterSpacing:"0.14em"}}>{issues.length} não conformidade{issues.length>1?"s":""}</p>
            <Card pad="0" radius={24} style={{background:"#FFFBEB",border:"1px solid #FDE68A",overflow:"hidden",boxShadow:"0 12px 30px rgba(146,64,14,.08)"}}>
              {issues.map((x,i)=>{const c=SC[x.score];return(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:11,padding:"12px 14px",borderBottom:i<issues.length-1?"1px solid #FEF3C7":"none"}}>
                  <span style={{fontSize:14,fontWeight:900,padding:"4px 9px",borderRadius:99,background:c.bg,color:c.tx,border:`1px solid ${c.br}`,flexShrink:0,marginTop:1}}>{x.score}</span>
                  <div>
                    <p style={{fontSize:14,fontWeight:700,color:x.areaColor,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,lineHeight:1.3}}>{x.area}{x.room?` #${x.room}`:""}</p>
                    <p style={{fontSize:14,color:INK2,lineHeight:1.45}}>{x.item}</p>
                  </div>
                </div>);})}
            </Card>
          </>
        )}

        {/* Observations */}
        {areaScores.some(a=>a.notes)&&(
          <Card pad="1rem" radius={24}>
            <p style={{fontSize:14,fontWeight:700,color:FAINT,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:8}}>Observações</p>
            {areaScores.filter(a=>a.notes).map(a=>(
              <div key={a.id} style={{marginBottom:6}}>
                <p style={{fontSize:14,fontWeight:700,color:a.color,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,lineHeight:1.3}}>{a.short}{a.room?` #${a.room}`:""}</p>
                <p style={{fontSize:14,color:MUTED,lineHeight:1.6}}>{a.notes}</p>
              </div>
            ))}
          </Card>
        )}

        {/* Alert */}
        {!passed&&(
          <div style={{background:urgent?"#FEF2F2":"#FFFBEB",border:`1.5px solid ${urgent?"#FECACA":"#FDE68A"}`,borderRadius:22,padding:"15px 16px",boxShadow:urgent?"0 12px 30px rgba(153,27,27,.08)":"0 12px 30px rgba(146,64,14,.08)"}}>
            <p style={{fontSize:14,fontWeight:900,color:urgent?"#991B1B":"#92400E",marginBottom:5,lineHeight:1.35}}>
              {urgent?"Ação imediata — notificar fornecedor":"Notificar fornecedor"}
            </p>
            <p style={{fontSize:14,color:urgent?"#B91C1C":"#B45309",lineHeight:1.6}}>
              {urgent?"Item com nota 0–1 identificado. Correção imediata. Escalada à Direção.":"Nota geral abaixo de 4,0. Envie o relatório ao líder de equipe. Prazo: mesmo dia."}
            </p>
          </div>
        )}

        <div style={{display:"flex",gap:8}}>
          <button onClick={onHome} style={{flex:1,padding:"15px",minHeight:52,borderRadius:18,border:`1px solid ${RING}`,background:PAPER,color:MUTED,fontSize:16,fontWeight:800,fontFamily:"inherit",cursor:"pointer",boxShadow:SOFT_SHADOW}}>Início</button>
          <button onClick={onNewAudit} className="btn-scale" style={{flex:1,padding:"15px",minHeight:52,borderRadius:18,border:"none",background:BLUE,color:"#fff",fontSize:16,fontWeight:900,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 14px 28px rgba(31,78,121,.22)"}}>Nova auditoria</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tela: Dashboard ──────────────────────────────────────────────────────────
function DashboardScreen({onBack,onAreas,history}){
  const today=todaySP();const weekStart=startOfWeek(today);
  const todayA=history.filter(a=>a.date===today);
  const weekA=history.filter(a=>a.date>=weekStart);
  const weekAvg=avg(weekA.map(a=>a.overallScore).filter(Boolean));
  const weekAlerts=weekA.filter(a=>a.overallScore<4).length;

  const trendData=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));
    const ds=d.toISOString().split("T")[0];
    const scores=history.filter(a=>a.date===ds).map(a=>a.overallScore).filter(Boolean);
    return{day:fmtShort(ds),score:scores.length?parseFloat(avg(scores).toFixed(2)):null,count:scores.length};
  });

  const belowAreas=AREAS.map(a=>{
    const scores=weekA.flatMap(aud=>{const it=(aud.areas?.[a.id]?.items||[]).filter(s=>s!==null);return it.length?[avg(it)]:[];});
    return{...a,score:scores.length?avg(scores):null};
  }).filter(a=>a.score!==null&&a.score<4);

  const CT=({active,payload,label})=>active&&payload?.length?(
    <div style={{background:PAPER,border:`1px solid ${RING}`,borderRadius:10,padding:"8px 12px",fontSize:14}}>
      <p style={{fontWeight:700,color:INK,marginBottom:2}}>{label}</p>
      <p style={{color:MUTED}}>Nota: {payload[0]?.value?.toFixed(2)||"—"}</p>
    </div>):null;

  return(
    <div className="au">
      <div style={{background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,borderBottom:`1px solid ${GLASS_BORDER}`,padding:"0.95rem 1rem",display:"flex",alignItems:"center",gap:12,boxShadow:"0 12px 30px rgba(17,24,39,.08)"}}>
        <button onClick={onBack} style={{width:44,height:44,borderRadius:14,background:SHEET,border:`1px solid ${RING}`,color:INK,cursor:"pointer",fontSize:17,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 12px rgba(15,23,42,.05)"}}>←</button>
        <div style={{flex:1}}>
          <p style={{fontSize:18,fontWeight:900,color:INK,letterSpacing:"-0.03em"}}>Indicadores de Facilities</p>
          <p style={{fontSize:14,color:FAINT,lineHeight:1.35,marginTop:2}}>{SHEETS_ON?"Sincronizado com Planilha Google":"Dados locais neste dispositivo"}</p>
          <p style={{fontSize:14,color:MUTED,lineHeight:1.4,marginTop:4}}>Indicadores baseados no histórico local deste dispositivo.</p>
        </div>
      </div>

      <div style={{padding:"1rem",display:"flex",flexDirection:"column",gap:12}}>
        {/* KPI grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            ["Hoje",`${todayA.length}/4`,"auditorias",false],
            ["Semana",weekAvg?weekAvg.toFixed(1):"—","média geral",false],
            ["Alertas",weekAlerts||"0","abaixo de 4,0",weekAlerts>0],
          ].map(([title,val,sub,isAlert])=>(
            <Card key={title} pad="14px 10px" radius={24} style={{border:`1px solid ${isAlert?"rgba(243,211,156,.78)":GLASS_BORDER}`,background:isAlert?"rgba(255,247,232,.82)":GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,boxShadow:isAlert?"0 16px 34px rgba(217,119,6,.10)":GLASS_SHADOW}}>
              <p style={{fontSize:14,color:FAINT,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",lineHeight:1.2}}>{title}</p>
              <p style={{fontSize:26,fontWeight:900,color:isAlert?"#D97706":INK,letterSpacing:"-0.05em",lineHeight:.95}}>{val}</p>
              <p style={{fontSize:14,color:FAINT,marginTop:5,lineHeight:1.25}}>{sub}</p>
            </Card>
          ))}
        </div>

        {/* Trend chart */}
        {trendData.some(d=>d.count>0)&&(
          <DarkCard pad="1.25rem" radius={28}>
            <p style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:4}}>Tendência</p>
            <p style={{fontSize:16,fontWeight:900,color:"#fff",letterSpacing:"-0.03em",marginBottom:14}}>Nota média — 7 dias</p>
            <ResponsiveContainer width="100%" height={136}>
              <LineChart data={trendData} margin={{top:4,right:4,left:-24,bottom:0}}>
                <XAxis dataKey="day" tick={{fontSize:14,fill:"rgba(255,255,255,.4)"}} axisLine={false} tickLine={false}/>
                <YAxis domain={[2,5]} tick={{fontSize:14,fill:"rgba(255,255,255,.4)"}} axisLine={false} tickLine={false}/>
                <Tooltip content={<CT/>}/>
                <ReferenceLine y={4} stroke="rgba(255,255,255,.3)" strokeDasharray="3 3" strokeWidth={1.5}/>
                <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2.5} dot={{r:3,fill:"#10B981"}} connectNulls/>
              </LineChart>
            </ResponsiveContainer>
            <p style={{fontSize:14,color:"rgba(255,255,255,.35)",marginTop:6,lineHeight:1.35}}>Linha = padrão mínimo 4,0</p>
          </DarkCard>
        )}

        {!trendData.some(d=>d.count>0)&&history.length>0&&(
          <Card radius={26} style={{textAlign:"center",padding:"1.6rem 1rem",background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,border:`1px solid ${GLASS_BORDER}`,boxShadow:GLASS_SHADOW}}>
            <p style={{fontSize:17,fontWeight:900,color:INK,letterSpacing:"-0.02em",marginBottom:6}}>Indicadores em formação</p>
            <p style={{fontSize:14,color:MUTED,lineHeight:1.5}}>Continue registrando auditorias para consolidar tendência semanal.</p>
          </Card>
        )}

        {/* Below standard areas */}
        {belowAreas.length>0&&(
          <>
            <p style={{fontSize:14,fontWeight:700,color:"#92400E",textTransform:"uppercase",letterSpacing:"0.14em"}}>Áreas abaixo de 4,0 esta semana</p>
            <Card pad="0" radius={24} style={{overflow:"hidden"}}>
              {belowAreas.map((a,i)=>{const c=scoreColor(a.score);return(
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:0,borderBottom:i<belowAreas.length-1?`1px solid ${RING}`:"none"}}>
                  <div style={{width:5,alignSelf:"stretch",background:a.color,flexShrink:0}}/>
                  <div style={{display:"flex",alignItems:"center",gap:10,flex:1,padding:"12px 13px"}}>
                    <span style={{flex:1,fontSize:14,fontWeight:600,color:INK,lineHeight:1.35}}>{a.short}</span>
                    <span style={{fontSize:14,fontWeight:900,padding:"4px 12px",borderRadius:99,background:c.bg,color:c.tx,border:`1px solid ${c.br}`,lineHeight:1.2}}>{a.score.toFixed(1)}</span>
                  </div>
                </div>);})}
            </Card>
          </>
        )}

        {history.length===0&&(
          <Card radius={28} style={{textAlign:"center",padding:"2.2rem 1.2rem",background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,border:`1px solid ${GLASS_BORDER}`,boxShadow:GLASS_SHADOW}}>
            <p style={{fontSize:18,fontWeight:900,color:INK,letterSpacing:"-0.03em",marginBottom:8}}>Nenhuma auditoria registrada</p>
            <p style={{fontSize:15,color:MUTED,lineHeight:1.5}}>Faça a primeira rodada para ativar os indicadores operacionais.</p>
          </Card>
        )}
      </div>
      <BottomNav active="Indicadores" onAudit={onBack} onAreas={onAreas} onIndicadores={()=>{}}/>
    </div>
  );
}

// ─── Tela: Histórico ──────────────────────────────────────────────────────────
function HistoryScreen({history,onBack,onDashboard,onView}){
  const sorted=[...history].sort((a,b)=>b.timestamp-a.timestamp).slice(0,80);
  const grouped=sorted.reduce((acc,a)=>{if(!acc[a.date])acc[a.date]=[];acc[a.date].push(a);return acc;},{});
  return(
    <div className="au">
      <div style={{background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,borderBottom:`1px solid ${GLASS_BORDER}`,padding:"0.95rem 1rem",display:"flex",alignItems:"center",gap:12,boxShadow:"0 12px 30px rgba(17,24,39,.08)"}}>
        <button onClick={onBack} style={{width:44,height:44,borderRadius:14,background:SHEET,border:`1px solid ${RING}`,color:INK,cursor:"pointer",fontSize:17,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 12px rgba(15,23,42,.05)"}}>←</button>
        <p style={{fontSize:18,fontWeight:900,color:INK,letterSpacing:"-0.03em",flex:1}}>Áreas auditadas</p>
        <span style={{fontSize:14,color:FAINT}}>{sorted.length} auditorias</span>
      </div>
      {sorted.length===0
        ?<Card radius={28} style={{margin:"1rem",padding:"2.2rem 1.2rem",textAlign:"center",background:GLASS_SURFACE,backdropFilter:GLASS_BLUR,WebkitBackdropFilter:GLASS_BLUR,border:`1px solid ${GLASS_BORDER}`,boxShadow:GLASS_SHADOW}}>
          <p style={{fontSize:18,fontWeight:900,color:INK,letterSpacing:"-0.03em",marginBottom:8}}>Nenhuma área auditada</p>
          <p style={{fontSize:15,color:MUTED,lineHeight:1.5}}>As rodadas concluídas aparecerão aqui para revisão.</p>
        </Card>
        :(
          <div style={{padding:"0.9rem 1rem"}}>
            {Object.entries(grouped).map(([date,audits])=>(
              <div key={date} style={{marginBottom:"1.25rem"}}>
                <p style={{fontSize:14,fontWeight:700,color:FAINT,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>{fmtDate(date)}</p>
                <div style={{display:"flex",flexDirection:"column",gap:9}}>
                  {audits.map(a=>{
                    const sc_=scoreColor(a.overallScore);
                    const slot=SLOTS.find(s=>s.id===a.slotId);
                    return(
                      <Card key={a.id} pad="0" radius={24} style={{overflow:"hidden",cursor:"pointer"}} onClick={()=>onView(a)}>
                        <div className="tap" style={{display:"flex",alignItems:"center",gap:0}}>
                          <div style={{width:5,alignSelf:"stretch",background:a.overallScore>=4?"#10B981":a.overallScore>=3?"#F59E0B":"#F43F5E",borderRadius:"24px 0 0 24px",flexShrink:0}}/>
                          <div style={{display:"flex",alignItems:"center",gap:13,flex:1,padding:"14px 15px 14px 13px"}}>
                            <div style={{width:50,height:50,borderRadius:16,background:sc_.bg,border:`1.5px solid ${sc_.br}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 6px 16px rgba(15,23,42,.06)"}}>
                              <span style={{fontSize:15,fontWeight:900,color:sc_.tx,lineHeight:1}}>{a.overallScore.toFixed(1)}</span>
                              <span style={{fontSize:14,color:sc_.tx,opacity:.6}}>/5</span>
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <p style={{fontSize:14,fontWeight:700,color:INK,marginBottom:2,lineHeight:1.3}}>{slot?.time} · {slot?.label}</p>
                              <p style={{fontSize:14,color:MUTED,lineHeight:1.35}}>{a.auditor}</p>
                            </div>
                            <Pill tone={a.overallScore>=4?"good":"bad"}>{a.overallScore>=4?"Adequado":"Ação"}</Pill>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      <BottomNav active="Áreas" onAudit={onBack} onAreas={()=>{}} onIndicadores={onDashboard}/>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function EspacosApp(){
  const[screen,   setScreen] =useState("name");
  const[auditor,  setAuditor]=useState(()=>localStorage.getItem("ec_auditor")||"");
  const[date]                =useState(todaySP);
  const[slot,     setSlot]   =useState(null);
  const[areaIdx,  setAreaIdx]=useState(0);
  const[audit,    setAudit]  =useState(null);
  const[history,  setHistory]=useState(()=>lhLoad());
  const[viewData, setViewData]=useState(null);
  const[pending,  setPending]=useState(()=>qLoad().length);

  useEffect(()=>{
    if(auditor)setScreen("home");
    if(SHEETS_ON&&qLoad().length){syncQueue().then(n=>{if(n>0)setPending(qLoad().length);});}
  },[]);

  const completeAudit=async()=>{
    const active=areasForSlot(slot);
    const aScores=active.map(a=>{const it=audit.areas[a.id].items.filter(s=>s!==null);return it.length?avg(it):null;}).filter(s=>s!==null);
    const overallScore=avg(aScores)||0;
    const entry={id:Date.now().toString(),timestamp:Date.now(),campus:"SP",date,slotId:slot.id,slotLabel:slot.label,overallScore,areas:audit.areas,auditor};
    const updated=[...history.filter(a=>!(a.date===date&&a.slotId===slot.id)),entry];
    lhSave(updated);setHistory(updated);
    if(SHEETS_ON){
      saveToSheets(entry).catch(()=>{qAdd(entry);setPending(p=>p+1);});
    }
    setViewData(entry);setScreen("summary");
  };

  const hScore=(aId,i,v)=>setAudit(p=>({...p,areas:{...p.areas,[aId]:{...p.areas[aId],items:p.areas[aId].items.map((s,j)=>j===i?v:s)}}}));
  const hNotes=(aId,n)=>setAudit(p=>({...p,areas:{...p.areas,[aId]:{...p.areas[aId],notes:n}}}));
  const hPhoto=(aId,b)=>setAudit(p=>({...p,areas:{...p.areas,[aId]:{...p.areas[aId],photo:b}}}));
  const hRoom =(aId,n)=>setAudit(p=>({...p,areas:{...p.areas,[aId]:{...p.areas[aId],roomNumber:n}}}));

  return(
    <>
      <style>{CSS}</style>
      <div className="app">
        {screen==="name"    &&<NameScreen onSet={n=>{localStorage.setItem("ec_auditor",n);setAuditor(n);setScreen("home");}}/>}
        {screen==="home"    &&<HomeScreen date={date} history={history} auditor={auditor} pending={pending}
          onStart={s=>{setSlot(s);setAudit(emptyAudit());setAreaIdx(0);setScreen("audit");}}
          onView={a=>{setViewData(a);setScreen("summary");}}
          onDashboard={()=>setScreen("dashboard")} onHistory={()=>setScreen("history")}/>}
        {screen==="audit"   &&audit&&slot&&<AuditScreen slot={slot} areaIdx={areaIdx} audit={audit}
          onScore={hScore} onNotes={hNotes} onPhoto={hPhoto} onRoomNumber={hRoom}
          onNext={()=>setAreaIdx(i=>i+1)}
          onPrev={()=>areaIdx===0?setScreen("home"):setAreaIdx(i=>i-1)}
          onDone={completeAudit}/>}
        {screen==="summary" &&viewData&&<SummaryScreen auditData={viewData} onHome={()=>setScreen("home")} onNewAudit={()=>setScreen("home")}/>}
        {screen==="dashboard"&&<DashboardScreen onBack={()=>setScreen("home")} onAreas={()=>setScreen("history")} history={history}/>}
        {screen==="history" &&<HistoryScreen history={history} onBack={()=>setScreen("home")} onDashboard={()=>setScreen("dashboard")} onView={a=>{setViewData(a);setScreen("summary");}}/>}
      </div>
    </>
  );
}
