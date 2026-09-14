import React from 'react';

const SellerAgendaDock: React.FC = () => (
  <style>{`
    @media (min-width: 901px) {
      button[title="Minha Agenda Motyq"] {
        top: auto !important;
        right: 1rem !important;
        bottom: 13.875rem !important;
        width: 8.5rem !important;
        height: 3.75rem !important;
        padding: 0.55rem 0.7rem !important;
        border-radius: 1rem !important;
        border: 1px solid rgb(186 230 253) !important;
        background: rgba(255,255,255,.97) !important;
        color: rgb(15 23 42) !important;
        box-shadow: 0 14px 34px rgba(15,23,42,.10) !important;
        backdrop-filter: blur(16px) !important;
        z-index: 157 !important;
      }
      button[title="Minha Agenda Motyq"]:hover {
        border-color: rgb(125 211 252) !important;
        background: rgb(240 249 255) !important;
      }
      button[title="Minha Agenda Motyq"] > div {
        gap: .5rem !important;
        align-items: center !important;
      }
      button[title="Minha Agenda Motyq"] > div > div:first-child {
        width: 2rem !important;
        height: 2rem !important;
        border-radius: .75rem !important;
        border-color: rgb(186 230 253) !important;
        background: rgb(240 249 255) !important;
        color: rgb(2 132 199) !important;
      }
      button[title="Minha Agenda Motyq"] > div > div:nth-child(2) p:first-child {
        margin: 0 !important;
        color: rgb(2 132 199) !important;
        font-size: 8px !important;
        line-height: 1rem !important;
        letter-spacing: .11em !important;
      }
      button[title="Minha Agenda Motyq"] > div > div:nth-child(2) p:nth-child(2) {
        margin-top: .05rem !important;
        color: rgb(15 23 42) !important;
        font-size: 12px !important;
        line-height: 1rem !important;
      }
      button[title="Minha Agenda Motyq"] > div > div:nth-child(2) p:nth-child(3) {
        display: none !important;
      }
      button[title="Minha Agenda Motyq"] > div > span {
        min-width: 1.35rem !important;
        padding: .18rem .38rem !important;
        font-size: 10px !important;
      }
    }
  `}</style>
);

export default SellerAgendaDock;
