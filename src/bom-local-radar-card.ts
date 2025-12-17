import { LitElement, html, css, type CSSResultGroup, type TemplateResult } from 'lit';
import { property, customElement, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, LovelaceCard } from 'custom-card-helpers';
import './editor';
import { BomLocalRadarCardConfig, RadarResponse, RadarFrame, RadarTimeSeriesResponse, MetadataDisplayConfig, ControlsDisplayConfig, ErrorState, GridOptions, ApiErrorResponse } from './types';
import { CARD_VERSION, DEFAULT_SERVICE_URL, DEFAULT_FRAME_INTERVAL, DEFAULT_REFRESH_INTERVAL, DEFAULT_RESTART_DELAY } from './const';

console.info(
  `%c  BOM-LOCAL-RADAR-CARD  \n%c  Version ${CARD_VERSION}   `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

type LovelaceCustomCard = {
  type: string;
  name: string;
  preview?: boolean;
  description?: string;
};

declare global {
  interface Window {
    customCards?: LovelaceCustomCard[];
  }
}

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: 'bom-local-radar-card',
  name: 'BOM Local Radar Card',
  description: 'A rain radar card using the local BOM service',
});

@customElement('bom-local-radar-card')
export class BomLocalRadarCard extends LitElement implements LovelaceCard {
  static override styles: CSSResultGroup = css`
    :host {
      --bom-primary-color: var(--primary-color, #667eea);
      --bom-secondary-color: var(--secondary-text-color, #666);
      --bom-card-background: var(--card-background-color, white);
      --bom-text-color: var(--primary-text-color, #333);
      --bom-border-color: var(--divider-color, #e0e0e0);
    }

    #root {
      width: 100%;
      position: relative;
    }

    /* Radar Image Container */
    .radar-image-container {
      position: relative;
      width: 100%;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 15px;
      aspect-ratio: 16/9;
      min-height: 200px; /* Smaller on mobile */
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (min-width: 480px) {
      .radar-image-container {
        min-height: 300px;
      }
    }

    @media (min-width: 768px) {
      .radar-image-container {
        min-height: 400px;
      }
    }

    .radar-image {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      image-rendering: crisp-edges;
      transition: transform 0.3s ease;
    }

    .radar-image-contain {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .radar-image-cover {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .radar-image-fill {
      width: 100%;
      height: 100%;
      object-fit: fill;
    }

    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 1.2em;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .loading-message {
      font-size: 0.9em;
      opacity: 0.9;
    }
    .frame-slider-container {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      border-radius: 12px;
      border: 2px solid #e0e0e0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      margin-bottom: 15px;
      box-sizing: border-box;
    }
    .frame-slider-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .frame-nav-btn {
      padding: 10px 16px;
      border: 2px solid var(--primary-color, #667eea);
      background: white;
      color: var(--primary-color, #667eea);
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9em;
      transition: all 0.2s;
      min-width: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .frame-nav-btn:hover:not(:disabled) {
      background: var(--primary-color, #667eea);
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .frame-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: #f0f0f0;
      border-color: #d0d0d0;
      color: #999;
    }
    .frame-slider {
      flex: 1;
      min-width: 120px;
      height: 10px;
      border-radius: 5px;
      background: #e0e0e0;
      outline: none;
      -webkit-appearance: none;
      cursor: pointer;
      order: 3;
    }
    .frame-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
      border: 3px solid white;
      transition: all 0.2s;
      margin-top: -7px; /* Center the 24px thumb on the 10px track: (24-10)/2 = 7 */
    }
    .frame-slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
    }
    .frame-slider::-webkit-slider-runnable-track {
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
    }
    .frame-slider::-moz-range-thumb {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      cursor: pointer;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
    }
    .frame-slider::-moz-range-track {
      height: 10px;
      border-radius: 5px;
      background: #e0e0e0;
    }
    .frame-slider::-moz-range-progress {
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
    }
    .play-controls {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .play-btn {
      padding: 10px 16px;
      border: 2px solid var(--primary-color, #667eea);
      background: var(--primary-color, #667eea);
      color: white;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9em;
      transition: all 0.2s;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .play-btn:hover:not(:disabled) {
      background: var(--primary-color-dark, #5568d3);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .play-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .frame-info {
      text-align: center;
      color: var(--secondary-text-color, #666);
      font-size: 0.9em;
      margin-top: 10px;
    }
    .info-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 15px;
    }
    .info-card {
      background: var(--card-background-color, white);
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid var(--primary-color, #667eea);
    }
    .info-card h3 {
      font-size: 0.8em;
      text-transform: uppercase;
      color: var(--secondary-text-color, #666);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .info-card .value {
      font-size: 1.2em;
      font-weight: 600;
      color: var(--primary-text-color, #333);
    }
    /* Error Display */
    .error-container {
      padding: 16px;
    }

    .error-card {
      background: var(--card-background-color, #ffffff);
      border-radius: 12px;
      border-left: 4px solid var(--error-color);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.1));
      transition: opacity 0.3s ease, transform 0.3s ease;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 20px;
      background: var(--secondary-background-color, #fafafa);
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.1));
    }

    .error-icon {
      color: var(--error-color);
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .error-title {
      font-size: 1.1em;
      font-weight: 600;
      color: var(--primary-text-color, #212121);
      flex: 1;
    }

    .error-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .error-message {
      font-weight: 500;
      line-height: 1.7;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--primary-text-color, #212121);
      font-size: 1.05em;
      margin-bottom: 4px;
    }

    .error-line {
      min-height: 1.2em;
    }

    .error-line-spacer {
      height: 0.5em;
    }

    .error-code {
      font-size: 0.85em;
      font-family: monospace;
      color: var(--secondary-text-color, #666);
      background: var(--secondary-background-color, #f5f5f5);
      padding: 6px 12px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.1));
    }

    .code-icon {
      width: 16px;
      height: 16px;
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .error-retry-info {
      font-size: 0.9em;
      color: var(--primary-text-color, #212121);
      padding: 10px 14px;
      background: linear-gradient(135deg, 
        rgba(33, 150, 243, 0.08) 0%, 
        rgba(33, 150, 243, 0.04) 100%);
      border-radius: 8px;
      border-left: 3px solid var(--primary-color, #2196f3);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }

    .error-retry-info::before {
      content: '⏱';
      font-size: 1.1em;
    }

    .error-details {
      margin-top: 8px;
      padding-top: 16px;
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .error-detail-item {
      font-size: 0.9em;
      line-height: 1.6;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: var(--secondary-background-color, #fafafa);
      border-radius: 8px;
      transition: background 0.2s ease;
    }

    .error-detail-item:hover {
      background: var(--secondary-background-color, #f0f0f0);
    }

    .detail-icon {
      color: var(--error-color);
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }

    .detail-content {
      flex: 1;
      color: var(--primary-text-color, #212121);
    }

    .detail-content strong {
      font-weight: 600;
      color: var(--primary-text-color, #212121);
    }

    .detail-content code {
      font-family: monospace;
      font-size: 0.9em;
      background: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.15));
      color: var(--primary-text-color, #212121);
      display: inline-block;
      word-break: break-all;
    }

    .error-detail-item.suggested-range {
      background: linear-gradient(135deg, 
        rgba(255, 193, 7, 0.1) 0%, 
        rgba(255, 193, 7, 0.05) 100%);
      border-left: 3px solid var(--warning-color, #ffc107);
    }

    .suggestion-hint {
      font-size: 0.85em;
      color: var(--secondary-text-color, #666);
      margin-top: 4px;
      font-style: italic;
    }

    .error-actions {
      margin-top: 16px;
      display: flex;
      gap: 12px;
      justify-content: flex-start;
    }

    .retry-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      min-height: 44px;
      background: var(--error-color, #f44336);
      color: white !important;
      border: 2px solid var(--error-color, #f44336);
      border-radius: 8px;
      font-size: 0.95em;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      font-family: inherit;
      -webkit-appearance: none;
      appearance: none;
      user-select: none;
      position: relative;
      z-index: 1;
      filter: brightness(1.05);
    }
    
    .retry-button::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 6px;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
      pointer-events: none;
      z-index: -1;
    }

    .retry-button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      filter: brightness(0.95);
    }

    .retry-button:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .retry-button:focus {
      outline: 2px solid var(--error-color);
      outline-offset: 2px;
    }

    .retry-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .retry-icon {
      width: 18px;
      height: 18px;
      color: white;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }

    .retry-button span {
      color: white;
    }

    /* Metadata Section */
    .metadata-section {
      margin-bottom: 15px;
    }

    .metadata-section.metadata-cards {
      display: grid;
      grid-template-columns: 1fr; /* Single column on mobile */
      gap: 12px;
    }

    @media (min-width: 480px) {
      .metadata-section.metadata-cards {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 768px) {
      .metadata-section.metadata-cards {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
      }
    }

    .metadata-section.metadata-cards .metadata-item {
      background: var(--card-background-color, #ffffff);
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
    }

    .metadata-section.metadata-cards .metadata-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      transform: translateY(-1px);
    }

    .metadata-section.metadata-cards .metadata-label {
      font-size: 0.75em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
      margin-bottom: 2px;
    }

    .metadata-section.metadata-cards .metadata-value {
      font-size: 1.1em;
      font-weight: 600;
    }

    .metadata-section.metadata-compact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 0.9em;
    }

    .metadata-section.metadata-compact .metadata-item {
      background: var(--secondary-background-color, #f5f5f5);
      border-radius: 6px;
      padding: 8px 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .metadata-section.metadata-minimal {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85em;
    }

    .metadata-section.metadata-minimal .metadata-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
    }

    .metadata-section.metadata-minimal .metadata-item:last-child {
      border-bottom: none;
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .metadata-label {
      color: var(--bom-secondary-color);
      font-weight: 600;
      font-size: 0.85em;
    }

    .metadata-value {
      color: var(--bom-text-color);
      font-weight: 600;
    }

    .metadata-relative {
      color: var(--bom-secondary-color);
      font-size: 0.85em;
    }

    /* Overlay Controls */
    .controls-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      border-radius: 8px;
      padding: 12px;
      z-index: 10;
      transition: opacity 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 200px;
    }

    .controls-overlay.overlay-top {
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    .controls-overlay.overlay-bottom {
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
    }

    .controls-overlay.overlay-left {
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .controls-overlay.overlay-right {
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .controls-overlay.overlay-center {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    /* Metadata Overlay */
    .metadata-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      border-radius: 6px;
      padding: 8px 12px;
      z-index: 5;
      font-size: 0.85em;
      color: white;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metadata-overlay .metadata-item {
      color: white;
    }

    .metadata-overlay .metadata-label {
      color: rgba(255, 255, 255, 0.8);
    }

    .metadata-overlay.overlay-top {
      top: 12px;
      left: 12px;
      right: auto;
    }

    .metadata-overlay.overlay-bottom {
      bottom: 12px;
      left: 12px;
      right: auto;
    }

    .metadata-overlay.overlay-left {
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .metadata-overlay.overlay-right {
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .metadata-overlay.overlay-center {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    /* Controls Section */
    .controls-section {
      margin-top: 15px;
    }

    .frame-slider-container {
      width: 100%;
      padding: 15px;
      background: var(--bom-card-background);
      border-radius: 12px;
      border: 2px solid var(--bom-border-color);
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      margin-bottom: 15px;
      box-sizing: border-box;
    }

    .frame-slider-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .frame-nav-buttons {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .frame-nav-btn {
      padding: 10px 16px;
      border: 2px solid var(--bom-primary-color);
      background: var(--bom-card-background);
      color: var(--bom-primary-color);
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9em;
      transition: all 0.2s;
      min-width: 50px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .frame-nav-btn:hover:not(:disabled) {
      background: var(--bom-primary-color);
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .frame-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      background: #f0f0f0;
      border-color: #d0d0d0;
      color: #999;
    }

    .frame-slider {
      flex: 1;
      min-width: 120px;
      height: 10px;
      border-radius: 5px;
      background: var(--bom-border-color);
      outline: none;
      -webkit-appearance: none;
      cursor: pointer;
      order: 3;
    }

    .frame-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--bom-primary-color) 0%, #764ba2 100%);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
      border: 3px solid white;
      transition: all 0.2s;
      margin-top: -7px; /* Center the 24px thumb on the 10px track: (24-10)/2 = 7 */
    }

    .frame-slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
    }

    .frame-slider::-webkit-slider-runnable-track {
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(to right, var(--bom-primary-color) 0%, #764ba2 100%);
    }

    .frame-slider::-moz-range-thumb {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--bom-primary-color) 0%, #764ba2 100%);
      cursor: pointer;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
    }

    .frame-slider::-moz-range-track {
      height: 10px;
      border-radius: 5px;
      background: var(--bom-border-color);
    }

    .frame-slider::-moz-range-progress {
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(to right, var(--bom-primary-color) 0%, #764ba2 100%);
    }

    .play-controls {
      display: flex;
      flex-direction: row;
      gap: 8px;
      justify-content: center;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    /* Frame Info */
    .frame-info {
      text-align: center;
      color: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
      font-size: 0.85em;
      margin-top: 6px;
      margin-bottom: 4px;
      padding: 6px 12px;
      background: var(--card-background-color, #fff);
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      line-height: 1.4;
    }

    .frame-index {
      font-weight: 600;
      color: var(--primary-text-color, rgba(0, 0, 0, 0.87));
      white-space: nowrap;
    }

    .frame-time {
      white-space: nowrap;
      color: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
    }

    .observation-time {
      white-space: nowrap;
      color: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
    }

    .frame-progress {
      white-space: nowrap;
      color: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
      font-size: 0.9em;
    }
      font-size: 0.85em;
    }

    .frame-progress {
      font-size: 0.85em;
      opacity: 0.8;
    }

    .info-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 15px;
    }

    .info-card {
      background: var(--bom-card-background);
      border-radius: 8px;
      padding: 15px;
      border-left: 4px solid var(--bom-primary-color);
    }

    .info-card h3 {
      font-size: 0.8em;
      text-transform: uppercase;
      color: var(--bom-secondary-color);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .info-card .value {
      font-size: 1.2em;
      font-weight: 600;
      color: var(--bom-text-color);
    }

    /* Responsive adjustments */
    @media (min-width: 480px) {
      .frame-slider-wrapper {
        flex-wrap: nowrap;
      }
      .frame-slider {
        order: 0;
      }
    }
  `;

  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) private _config!: BomLocalRadarCardConfig;
  @property({ attribute: false }) public editMode?: boolean;

  @state() private radarData?: RadarResponse;
  @state() private currentFrameIndex = 0;
  @state() private isLoading = false;
  @state() private error?: ErrorState;
  @state() private animationTimer?: number; // Changed to number for requestAnimationFrame
  @state() private refreshTimer?: number;
  @state() private retryTimer?: number;
  @state() private isPlaying = false;
  @state() private frames: RadarFrame[] = [];
  @state() private isExtendedMode = false;
  private preloadedImages: HTMLImageElement[] = [];
  private _debouncedImageLoad?: (url: string) => void;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('bom-local-radar-card-editor') as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      type: 'custom:bom-local-radar-card',
      suburb: 'Pomona',
      state: 'QLD',
      service_url: 'http://localhost:8082',
    };
  }

  public setConfig(config: BomLocalRadarCardConfig): void {
    if (!config.suburb || !config.state) {
      throw new Error('suburb and state are required');
    }
    this._config = config;
  }

  /**
   * Dynamic card size based on configuration
   * Returns height in units (1 unit = 50px)
   */
  getCardSize(): number {
    let size = 4; // Base size for image (200px)
    
    // Add space for metadata if shown above/below
    const metadataConfig = this._getMetadataConfig();
    if (metadataConfig && typeof metadataConfig !== 'boolean') {
      if (metadataConfig.position !== 'overlay') {
        size += 1; // +50px for metadata section
      }
    } else if (metadataConfig === true) {
      size += 1;
    }
    
    // Add space for controls if shown below (not overlay)
    const controlsConfig = this._getControlsConfig();
    if (controlsConfig && typeof controlsConfig !== 'boolean') {
      if (controlsConfig.position !== 'overlay') {
        size += 2; // +100px for controls
      }
    } else if (controlsConfig === true) {
      // Default position is 'below', so add space
      size += 2;
    }
    
    return size;
  }

  /**
   * Define grid options for HA's sections view
   * This allows the card to integrate with HA's grid system
   */
  public getGridOptions(): GridOptions {
    // Calculate based on whether controls are visible
    const hasControls = this._shouldShowControls();
    const hasMetadata = this._shouldShowMetadata();
    
    // Base size: 6 columns (half width), 2 rows
    // Adjust based on content
    const baseRows = 2;
    const additionalRows = (hasControls ? 1 : 0) + (hasMetadata ? 0.5 : 0);
    
    return {
      columns: 6,  // Default: half width
      rows: baseRows + additionalRows,
      min_columns: 3,  // Minimum: quarter width
      min_rows: 2,     // Minimum: always show image
      max_columns: 12, // Can span full width
      max_rows: 8,     // Can be tall for detailed view
    };
  }

  /**
   * Resolves a URL relative to the service URL if it's a relative path
   * Service returns relative URLs like "/api/radar/.../frame/..." which need
   * to be resolved against the service_url base
   */
  private resolveImageUrl(url: string, serviceUrl: string): string {
    if (!url) return url;
    // If URL is already absolute (starts with http:// or https://), use as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // If URL is relative (starts with /), resolve against service URL
    if (url.startsWith('/')) {
      // Remove trailing slash from serviceUrl if present
      const baseUrl = serviceUrl.replace(/\/$/, '');
      return `${baseUrl}${url}`;
    }
    // If URL is relative without leading slash, resolve against service URL with path
    const baseUrl = serviceUrl.replace(/\/$/, '');
    return `${baseUrl}/${url}`;
  }

  /**
   * Fetches radar data from the local service
   * Supports both latest frames and historical timeseries
   */
  private async fetchRadarData(): Promise<RadarResponse | null> {
    const serviceUrl = this._config.service_url || DEFAULT_SERVICE_URL;
    const suburb = encodeURIComponent(this._config.suburb);
    const state = encodeURIComponent(this._config.state);
    
    try {
      this.isLoading = true;
      // Don't clear error immediately - let it fade out smoothly after data loads

      // Check if we're in extended mode (historical data)
      const timespan = this._config.timespan || 'latest';
      
      if (timespan !== 'latest') {
        // Fetch historical data via timeseries endpoint
        return await this.fetchHistoricalRadar(serviceUrl, suburb, state, timespan);
      } else {
        // Fetch latest frames
        const url = `${serviceUrl}/api/radar/${suburb}/${state}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          // Try to parse structured error response
          let errorData: ApiErrorResponse | any;
          let parsedJson = false;
          try {
            errorData = await response.json();
            parsedJson = true;
          } catch {
            // If JSON parsing fails, create a basic error structure
            errorData = { 
              message: response.statusText || 'Unknown error',
              errorCode: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
              errorType: 'ServiceError'
            };
          }

          // Handle structured API error response (support both camelCase and PascalCase)
          const errorCode = errorData.errorCode || errorData.ErrorCode;
          const message = errorData.message || errorData.Message || response.statusText || 'An error occurred';
          const errorType = errorData.errorType || errorData.ErrorType;
          const details = errorData.details || errorData.Details || {};
          const suggestions = errorData.suggestions || errorData.Suggestions || {};
          
          // Always use structured error if we parsed JSON, or if we have any error information
          if (parsedJson || errorCode || message || Object.keys(details).length > 0) {
            const retryAfter = suggestions.retryAfter as number || 
                             details.retryAfter as number || 30;
            const action = suggestions.action as string || 'retry_after_seconds';
            
            // Build enhanced error message based on error details
            let enhancedMessage = message;
            
            // Enhance message for cache not found scenarios
            if (errorCode === 'CACHE_NOT_FOUND' || (response.status === 404 && !errorCode)) {
              if (!enhancedMessage.includes('cache') && !enhancedMessage.includes('Cache')) {
                enhancedMessage = 'No cached data found for this location. Cache update has been triggered in background. Please retry in a few moments.';
              }
            }
            
            // Handle previous update failure
            if (details.previousUpdateFailed) {
              enhancedMessage = `${enhancedMessage}\n\nPrevious update failed: ${details.previousError || 'Unknown error'}`;
              if (details.previousErrorCode) {
                enhancedMessage += ` (${details.previousErrorCode})`;
              }
            }
            
            // Handle time range errors with available/requested ranges
            if (errorCode === 'TIME_RANGE_ERROR' && details.availableRange) {
              const available = details.availableRange;
              const requested = details.requestedRange;
              enhancedMessage += `\n\nAvailable data: ${available.oldest || 'N/A'} to ${available.newest || 'N/A'}`;
              if (available.totalCacheFolders) {
                enhancedMessage += ` (${available.totalCacheFolders} cache folders)`;
              }
              if (requested) {
                enhancedMessage += `\nRequested: ${requested.start || 'N/A'} to ${requested.end || 'N/A'}`;
              }
              if (details.requestedHours) {
                enhancedMessage += `\nRequested range: ${details.requestedHours} hours (max: ${details.maxHours || 'N/A'} hours)`;
              }
              // Add service suggestion if available
              if (suggestions.suggestion) {
                enhancedMessage += `\n\n💡 ${suggestions.suggestion}`;
              }
            }
            
            // Determine if we should auto-retry based on action
            const shouldAutoRetry = action !== 'manual_refresh_recommended' && 
                                   action !== 'check_network_and_retry';
            
            this.error = {
              message: enhancedMessage,
              type: this._mapErrorType(errorType || errorCode || (response.status === 404 ? 'CACHE_NOT_FOUND' : 'unknown')),
              retryable: response.status === 404 && (errorCode === 'CACHE_NOT_FOUND' || errorCode === 'NOT_FOUND' || !errorCode),
              retryAction: () => this.fetchRadarData(),
              retryAfter: shouldAutoRetry ? retryAfter : undefined,
              errorCode: errorCode || (response.status === 404 ? 'CACHE_NOT_FOUND' : `HTTP_${response.status}`),
              details: {
                ...details,
                action: action,
                refreshEndpoint: suggestions.refreshEndpoint as string,
                statusEndpoint: suggestions.statusEndpoint as string,
              },
            };

            // Auto-retry only if action suggests it and retryAfter is available
            if (this.error.retryable && shouldAutoRetry && retryAfter) {
              if (this.retryTimer) {
                window.clearTimeout(this.retryTimer);
              }
              this.retryTimer = window.setTimeout(() => {
                this.retryTimer = undefined;
                this.fetchRadarData();
              }, retryAfter * 1000);
            }
            return null;
          }

          // Fallback for non-structured errors
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data: any = await response.json();
        
        // Check if response contains an error (shouldn't happen with structured errors, but handle legacy format)
        if (data.error) {
          const retryAfter = data.retryAfter || 30;
          this.error = {
            message: data.error || 'Service returned an error',
            type: 'cache',
            retryable: true,
            retryAction: () => this.fetchRadarData(),
            retryAfter: retryAfter,
          };
          if (this.retryTimer) {
            window.clearTimeout(this.retryTimer);
          }
          this.retryTimer = window.setTimeout(() => {
            this.retryTimer = undefined;
            this.fetchRadarData();
          }, retryAfter * 1000);
          return null;
        }
        
        // Validate response has frames
        if (!data.frames || data.frames.length === 0) {
          throw new Error('No frames available in response');
        }

        // Clear error only after successful data load to prevent glitch
        this.error = undefined;

        // Resolve relative image URLs against service URL
        // Service returns relative URLs like "/api/radar/.../frame/..." 
        // which need to be absolute for browser to fetch from correct origin
        data.frames.forEach((frame: RadarFrame) => {
          if (frame.imageUrl) {
            frame.imageUrl = this.resolveImageUrl(frame.imageUrl, serviceUrl);
          }
        });

        this.radarData = data;
        this.frames = data.frames.sort((a, b) => a.frameIndex - b.frameIndex);
        this.isExtendedMode = false;
        this.isLoading = false;
        
        // Preload images
        this.preloadImages(this.frames);
        
        // Start animation if auto-play is enabled and not already playing
        // Only restart if frames changed or we're not playing
        if (this._config.auto_play !== false && !this.isPlaying) {
          this.startAnimation();
        }

        return data;
      }
    } catch (err) {
      this.isLoading = false;
      
      // Categorize errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        this.error = {
          message: 'Network error: Unable to connect to service',
          type: 'network',
          retryable: true,
          retryAction: () => this.fetchRadarData(),
        };
      } else if (err instanceof Error && err.message.includes('Cache')) {
        this.error = {
          message: err.message,
          type: 'cache',
          retryable: true,
          retryAction: () => this.fetchRadarData(),
        };
      } else {
        this.error = {
          message: err instanceof Error ? err.message : 'Unknown error occurred',
          type: 'unknown',
          retryable: true,
          retryAction: () => this.fetchRadarData(),
        };
      }
      
      console.error('Error fetching radar data:', err);
      return null;
    }
  }

  /**
   * Fetches historical radar data for extended timespan
   */
  private async fetchHistoricalRadar(
    serviceUrl: string,
    suburb: string,
    state: string,
    timespan: string
  ): Promise<RadarResponse | null> {
    try {
      let startTime: Date | null = null;
      let endTime = new Date();

      if (timespan === 'custom') {
        if (this._config.custom_start_time) {
          startTime = new Date(this._config.custom_start_time);
        }
        if (this._config.custom_end_time) {
          endTime = new Date(this._config.custom_end_time);
        }
      } else {
        // Calculate hours back from now
        const hours = parseInt(timespan.replace('h', '')) || 1;
        startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000));
      }

      if (!startTime) {
        throw new Error('Invalid timespan configuration');
      }

      const url = `${serviceUrl}/api/radar/${suburb}/${state}/timeseries?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        // Try to parse structured error response
        let errorData: ApiErrorResponse | any;
        let parsedJson = false;
        try {
          errorData = await response.json();
          parsedJson = true;
        } catch {
          // If JSON parsing fails, create a basic error structure
          errorData = { 
            message: response.statusText || 'Unknown error',
            errorCode: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
            errorType: 'ServiceError'
          };
        }

        // Handle structured API error response (support both camelCase and PascalCase)
        const errorCode = errorData.errorCode || errorData.ErrorCode;
        const message = errorData.message || errorData.Message || response.statusText || 'Failed to fetch historical radar data';
        const errorType = errorData.errorType || errorData.ErrorType;
        const details = errorData.details || errorData.Details || {};
        const suggestions = errorData.suggestions || errorData.Suggestions || {};
        
        // Always use structured error if we parsed JSON, or if we have any error information
        if (parsedJson || errorCode || message || Object.keys(details).length > 0) {
          const retryAfter = suggestions.retryAfter as number || 30;
          const action = suggestions.action as string || 'retry_after_seconds';
          
          // Build enhanced error message based on error details
          let enhancedMessage = message;
          
          // Enhance message for cache not found scenarios
          if (errorCode === 'CACHE_NOT_FOUND' || (response.status === 404 && !errorCode)) {
            if (!enhancedMessage.includes('cache') && !enhancedMessage.includes('Cache')) {
              enhancedMessage = 'No cached data found for this location. Cache update has been triggered in background. Please retry in a few moments.';
            }
          }
          
          // Handle previous update failure
          if (details.previousUpdateFailed) {
            enhancedMessage = `${enhancedMessage}\n\nPrevious update failed: ${details.previousError || 'Unknown error'}`;
            if (details.previousErrorCode) {
              enhancedMessage += ` (${details.previousErrorCode})`;
            }
          }
          
          // Handle time range errors with available/requested ranges
          if (errorCode === 'TIME_RANGE_ERROR' && details.availableRange) {
            const available = details.availableRange;
            const requested = details.requestedRange;
            enhancedMessage += `\n\nAvailable data: ${available.oldest || 'N/A'} to ${available.newest || 'N/A'}`;
            if (available.totalCacheFolders) {
              enhancedMessage += ` (${available.totalCacheFolders} cache folders)`;
            }
            if (requested) {
              enhancedMessage += `\nRequested: ${requested.start || 'N/A'} to ${requested.end || 'N/A'}`;
            }
            if (details.requestedHours) {
              enhancedMessage += `\nRequested range: ${details.requestedHours} hours (max: ${details.maxHours || 'N/A'} hours)`;
            }
            // Add service suggestion if available
            if (suggestions.suggestion) {
              enhancedMessage += `\n\n💡 ${suggestions.suggestion}`;
            }
          }
          
          // Determine if we should auto-retry based on action
          const shouldAutoRetry = action !== 'manual_refresh_recommended' && 
                                 action !== 'check_network_and_retry' &&
                                 action !== 'adjust_time_range';
          
          this.error = {
            message: enhancedMessage,
            type: this._mapErrorType(errorType || errorCode || (response.status === 404 ? 'CACHE_NOT_FOUND' : 'unknown')),
            retryable: response.status === 404 || response.status === 400,
            retryAction: () => this.fetchRadarData(),
            retryAfter: shouldAutoRetry ? retryAfter : undefined,
            errorCode: errorCode || (response.status === 404 ? 'CACHE_NOT_FOUND' : `HTTP_${response.status}`),
            details: {
              ...details,
              action: action,
              refreshEndpoint: suggestions.refreshEndpoint as string,
              statusEndpoint: suggestions.statusEndpoint as string,
              suggestedRange: suggestions.suggestedRange as any,
            },
          };
          return null;
        }

        // Fallback: should not reach here if JSON was parsed, but handle gracefully
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RadarTimeSeriesResponse = await response.json();
      
      if (!data.cacheFolders || data.cacheFolders.length === 0) {
        throw new Error('No historical data found for the specified time range.');
      }

      // Flatten all frames from all cache folders
      // The service already sets absoluteObservationTime on each frame
      const allFrames: RadarFrame[] = [];
      data.cacheFolders.forEach(cacheFolder => {
        cacheFolder.frames.forEach(frame => {
          // Store folder metadata for reference (service already sets absoluteObservationTime)
          frame.cacheTimestamp = cacheFolder.cacheTimestamp;
          frame.observationTime = cacheFolder.observationTime;
          frame.cacheFolderName = cacheFolder.cacheFolderName;
          
          // Resolve relative image URLs against service URL
          if (frame.imageUrl) {
            frame.imageUrl = this.resolveImageUrl(frame.imageUrl, serviceUrl);
          }
          
          // Ensure absoluteObservationTime is set (service should provide this, but handle if missing)
          if (!frame.absoluteObservationTime && frame.observationTime && frame.minutesAgo !== undefined) {
            // Fallback: calculate from observation time and minutes ago
            const obsTime = new Date(frame.observationTime);
            frame.absoluteObservationTime = new Date(obsTime.getTime() - (frame.minutesAgo * 60 * 1000)).toISOString();
          }
          
          allFrames.push(frame);
        });
      });

      // Re-index frames sequentially
      allFrames.forEach((frame, idx) => {
        frame.sequentialIndex = idx;
      });

      // Fetch latest metadata for display
      let metadata: Partial<RadarResponse> = {};
      try {
        const metadataUrl = `${serviceUrl}/api/radar/${suburb}/${state}/metadata`;
        const metadataResponse = await fetch(metadataUrl);
        if (metadataResponse.ok) {
          metadata = await metadataResponse.json();
        }
      } catch (err) {
        console.debug('Could not fetch metadata:', err);
      }

      // Create RadarResponse-like object
      const newestCacheFolder = data.cacheFolders[data.cacheFolders.length - 1];
      const radarResponse: RadarResponse = {
        frames: allFrames,
        lastUpdated: endTime.toISOString(),
        observationTime: metadata.observationTime || newestCacheFolder?.observationTime || endTime.toISOString(),
        forecastTime: endTime.toISOString(),
        weatherStation: metadata.weatherStation,
        distance: metadata.distance,
        cacheIsValid: metadata.cacheIsValid ?? true,
        cacheExpiresAt: metadata.cacheExpiresAt || endTime.toISOString(),
        isUpdating: metadata.isUpdating || false,
        nextUpdateTime: metadata.nextUpdateTime || endTime.toISOString(),
      };

      // Clear error only after successful data load to prevent glitch
      this.error = undefined;
      
      this.radarData = radarResponse;
      this.frames = allFrames;
      this.isExtendedMode = true;
      this.isLoading = false;

      // Preload images
      this.preloadImages(this.frames);

      // Start animation if auto-play is enabled and not already playing
      // Only restart if frames changed or we're not playing
      if (this._config.auto_play !== false && !this.isPlaying) {
        this.startAnimation();
      }

      return radarResponse;
    } catch (err) {
      this.isLoading = false;
      
      // Categorize errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        this.error = {
          message: 'Network error: Unable to connect to service',
          type: 'network',
          retryable: true,
          retryAction: () => this.fetchRadarData(),
        };
      } else {
        this.error = {
          message: err instanceof Error ? err.message : 'Failed to fetch historical radar data',
          type: 'unknown',
          retryable: true,
          retryAction: () => this.fetchRadarData(),
        };
      }
      
      console.error('Error fetching historical radar data:', err);
      return null;
    }
  }

  /**
   * Gets the current frame image URL
   */
  private getCurrentFrameUrl(): string | null {
    if (!this.frames || this.frames.length === 0) {
      return null;
    }
    const frame = this.frames[this.currentFrameIndex];
    return frame?.imageUrl || null;
  }

  /**
   * Helper to get metadata config
   */
  private _getMetadataConfig(): boolean | MetadataDisplayConfig | undefined {
    const showMetadata = this._config.show_metadata;
    if (showMetadata === undefined) {
      return true; // Default: show all metadata
    }
    return showMetadata;
  }

  /**
   * Helper to get controls config
   */
  private _getControlsConfig(): boolean | ControlsDisplayConfig | undefined {
    const showControls = this._config.show_controls;
    if (showControls === undefined) {
      return true; // Default: show all controls
    }
    return showControls;
  }

  /**
   * Check if metadata should be shown
   */
  private _shouldShowMetadata(): boolean {
    const config = this._getMetadataConfig();
    return config !== false;
  }

  /**
   * Check if controls should be shown
   */
  private _shouldShowControls(): boolean {
    const config = this._getControlsConfig();
    return config !== false;
  }

  /**
   * Get locale for formatting
   */
  private _getLocale(): string {
    return this._config.locale || this.hass?.locale?.language || 'en-AU';
  }

  /**
   * Map API error type to card error type
   */
  private _mapErrorType(apiErrorType: string): ErrorState['type'] {
    if (!apiErrorType) return 'unknown';
    const type = apiErrorType.toLowerCase();
    if (type.includes('cache') || type === 'cache_not_found' || type === 'cacheerror') return 'cache';
    if (type.includes('validation') || type === 'validation_error' || type === 'validationerror') return 'validation';
    if (type.includes('network') || type.includes('fetch')) return 'network';
    if (type.includes('notfound') || type === 'not_found' || type === 'notfounderror') return 'cache';
    return 'unknown';
  }

  /**
   * Get error title based on error type
   */
  private _getErrorTitle(): string {
    switch (this.error?.type) {
      case 'cache':
        return 'Cache Not Ready';
      case 'network':
        return 'Connection Error';
      case 'validation':
        return 'Configuration Error';
      default:
        return 'Error';
    }
  }

  /**
   * Get error icon based on error type
   */
  private _getErrorIcon(): string {
    switch (this.error?.type) {
      case 'cache':
        return 'mdi:database-refresh';
      case 'network':
        return 'mdi:wifi-off';
      case 'validation':
        return 'mdi:alert-circle';
      default:
        return 'mdi:alert';
    }
  }

  /**
   * Get error color based on error type
   */
  private _getErrorColor(): string {
    switch (this.error?.type) {
      case 'cache':
        return 'var(--warning-color, #ff9800)';
      case 'network':
        return 'var(--error-color, #f44336)';
      case 'validation':
        return 'var(--error-color, #f44336)';
      default:
        return 'var(--warning-color, #ff9800)';
    }
  }

  /**
   * Formats timestamp for display
   */
  private formatTimestamp(isoString: string): string {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const locale = this._getLocale();
    // Use HA timezone if available, otherwise use browser's timezone
    const timeZone = this.hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    return date.toLocaleString(locale, {
      timeZone: timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Relative time (e.g., "5 min ago", "2 hours ago")
   */
  private formatRelativeTime(isoString: string): string {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  /**
   * Check if frame should be preloaded (only nearby frames)
   */
  private _shouldPreloadFrame(index: number): boolean {
    const currentIndex = this.currentFrameIndex;
    // Preload current, next, and previous frames
    return Math.abs(index - currentIndex) <= 1;
  }

  /**
   * Preloads nearby frame images to prevent jiggle when switching
   * Cleans up old preloaded images to prevent memory leaks
   * Only preloads frames near the current frame for performance
   */
  private preloadImages(frames: RadarFrame[]): void {
    // Clean up old preloaded images
    this.preloadedImages.forEach(img => {
      img.src = '';
      img.onload = null;
      img.onerror = null;
    });
    this.preloadedImages = [];

    // Only preload nearby frames
    frames.forEach((frame, index) => {
      if (this._shouldPreloadFrame(index)) {
        const img = new Image();
        img.src = frame.imageUrl;
        this.preloadedImages.push(img);
      }
    });
  }

  /**
   * Debounce helper
   */
  private _debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | undefined;
    return (...args: Parameters<T>) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Starts the frame animation loop using requestAnimationFrame
   * Ensures only one animation timer is active at a time
   */
  private startAnimation(): void {
    // Always stop existing animation first to prevent accumulation
    this.stopAnimation();

    if (this.frames.length === 0) {
      return;
    }

    this.isPlaying = true;
    const frameInterval = (this._config.frame_interval || DEFAULT_FRAME_INTERVAL) * 1000;
    const restartDelay = DEFAULT_RESTART_DELAY;
    const maxFrame = this.frames.length - 1;

    let lastFrameTime = performance.now();
    let frameStartTime = lastFrameTime;

    const animate = (currentTime: number) => {
      // Check if we're still playing (might have been stopped)
      if (!this.isPlaying) {
        return;
      }

      // Check if animation was cleared (component disconnected)
      if (!this.animationTimer) {
        return;
      }

      const elapsed = currentTime - lastFrameTime;

      if (this.currentFrameIndex >= maxFrame) {
        // Check if we've waited long enough before restarting
        if (elapsed >= restartDelay) {
          this.currentFrameIndex = 0;
          this.requestUpdate();
          frameStartTime = currentTime;
          lastFrameTime = currentTime;
        }
      } else {
        // Check if it's time to advance to next frame
        if (elapsed >= frameInterval) {
          this.currentFrameIndex++;
          this.requestUpdate();
          lastFrameTime = currentTime;
        }
      }

      // Continue animation
      this.animationTimer = requestAnimationFrame(animate);
    };

    // Start animation
    this.animationTimer = requestAnimationFrame(animate);
  }

  /**
   * Stops the animation
   */
  private stopAnimation(): void {
    if (this.animationTimer) {
      cancelAnimationFrame(this.animationTimer);
      this.animationTimer = undefined;
    }
    this.isPlaying = false;
  }

  /**
   * Toggles play/pause
   */
  private toggleAnimation(): void {
    if (this.isPlaying) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  /**
   * Shows a specific frame
   */
  private showFrame(index: number): void {
    if (index < 0 || index >= this.frames.length) {
      return;
    }
    this.currentFrameIndex = index;
    this.requestUpdate();
  }

  /**
   * Navigate to previous frame
   */
  private previousFrame(): void {
    this.stopAnimation();
    const newIndex = this.currentFrameIndex > 0 ? this.currentFrameIndex - 1 : this.frames.length - 1;
    this.showFrame(newIndex);
  }

  /**
   * Navigate to next frame
   */
  private nextFrame(): void {
    this.stopAnimation();
    const newIndex = (this.currentFrameIndex + 1) % this.frames.length;
    this.showFrame(newIndex);
  }

  /**
   * Jump forward/backward by N frames
   */
  private jumpFrame(offset: number): void {
    const newIndex = Math.max(0, Math.min(this.frames.length - 1, this.currentFrameIndex + offset));
    this.showFrame(newIndex);
  }

  /**
   * Auto-refresh data
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
    }

    const refreshInterval = (this._config.refresh_interval || DEFAULT_REFRESH_INTERVAL) * 1000;
    this.refreshTimer = window.setInterval(() => {
      this.fetchRadarData();
    }, refreshInterval);
  }

  /**
   * Stops auto-refresh
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  async firstUpdated(): Promise<void> {
    await this.fetchRadarData();
    this.startAutoRefresh();
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._handleKeyDown);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._handleKeyDown);
    this.stopAnimation();
    this.stopAutoRefresh();
    
    // Clean up retry timer
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    
    // Clean up preloaded images
    this.preloadedImages.forEach(img => {
      img.src = '';
      img.onload = null;
      img.onerror = null;
    });
    this.preloadedImages = [];
  }

  /**
   * Handle keyboard navigation
   */
  private _handleKeyDown = (e: KeyboardEvent): void => {
    // Only handle if card is focused or contains focused element
    if (!this.shadowRoot?.activeElement && document.activeElement !== this) {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.previousFrame();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.nextFrame();
        break;
      case ' ':
        e.preventDefault();
        this.toggleAnimation();
        break;
      case 'Home':
        e.preventDefault();
        this.showFrame(0);
        break;
      case 'End':
        e.preventDefault();
        this.showFrame(this.frames.length - 1);
        break;
    }
  };

  protected override updated(changedProperties: Map<string | number | symbol, unknown>): void {
    super.updated(changedProperties);
    
    // Handle config changes
    if (changedProperties.has('_config')) {
      const oldConfig = changedProperties.get('_config') as BomLocalRadarCardConfig | undefined;
      if (oldConfig && this._config) {
        // If location or timespan changed, refetch data
        if (oldConfig.suburb !== this._config.suburb || 
            oldConfig.state !== this._config.state ||
            oldConfig.timespan !== this._config.timespan ||
            oldConfig.custom_start_time !== this._config.custom_start_time ||
            oldConfig.custom_end_time !== this._config.custom_end_time) {
          this.fetchRadarData();
        }
        // If service URL changed, refetch
        if (oldConfig.service_url !== this._config.service_url) {
          this.fetchRadarData();
        }
        // If refresh interval changed, restart auto-refresh
        if (oldConfig.refresh_interval !== this._config.refresh_interval) {
          this.startAutoRefresh();
        }
        // If frame interval changed and playing, restart animation
        if (oldConfig.frame_interval !== this._config.frame_interval && this.isPlaying) {
          this.stopAnimation();
          this.startAnimation();
        }
      }
    }
  }

  /**
   * Render metadata section
   */
  private _renderMetadata(position: 'above' | 'below' | 'overlay'): TemplateResult | string {
    const config = this._getMetadataConfig();
    if (!config || (typeof config === 'boolean' && !config)) {
      return '';
    }

    const displayConfig = typeof config === 'object' ? config : {};
    // Default position is 'above' if not specified
    const configPosition = displayConfig.position ?? 'above';
    
    // Only render if position matches
    if (configPosition !== position) {
      return '';
    }

    // If overlay, render differently (overlay doesn't use style, it has its own compact format)
    if (position === 'overlay') {
      return this._renderOverlayMetadata();
    }

    // Default style is 'cards' if not specified
    const style = displayConfig.style ?? 'cards';

    return html`
      <div class="metadata-section metadata-${position} metadata-${style}">
        ${displayConfig.show_cache_status !== false ? this._renderCacheStatus() : ''}
        ${displayConfig.show_observation_time !== false ? this._renderObservationTime() : ''}
        ${displayConfig.show_forecast_time !== false ? this._renderForecastTime() : ''}
        ${displayConfig.show_weather_station !== false ? this._renderWeatherStation() : ''}
        ${displayConfig.show_distance !== false ? this._renderDistance() : ''}
        ${displayConfig.show_next_update !== false ? this._renderNextUpdate() : ''}
      </div>
    `;
  }

  /**
   * Render cache status
   */
  private _renderCacheStatus(): TemplateResult {
    if (!this.radarData) return html``;
    return html`
      <div class="metadata-item cache-status">
        <span class="metadata-label">Cache:</span>
        <span class="metadata-value">
          ${this.radarData.isUpdating ? 'Updating' : 
            this.radarData.cacheIsValid ? 'Valid' : 'Invalid'}
        </span>
      </div>
    `;
  }

  /**
   * Render observation time
   */
  private _renderObservationTime(): TemplateResult {
    if (!this.radarData?.observationTime) return html``;
    return html`
      <div class="metadata-item observation-time">
        <span class="metadata-label">Observation:</span>
        <span class="metadata-value">
          ${this.formatTimestamp(this.radarData.observationTime)}
        </span>
        <span class="metadata-relative">
          (${this.formatRelativeTime(this.radarData.observationTime)})
        </span>
      </div>
    `;
  }

  /**
   * Render forecast time
   */
  private _renderForecastTime(): TemplateResult {
    if (!this.radarData?.forecastTime) return html``;
    return html`
      <div class="metadata-item forecast-time">
        <span class="metadata-label">Forecast:</span>
        <span class="metadata-value">${this.formatTimestamp(this.radarData.forecastTime)}</span>
      </div>
    `;
  }

  /**
   * Render weather station
   */
  private _renderWeatherStation(): TemplateResult {
    if (!this.radarData?.weatherStation) return html``;
    return html`
      <div class="metadata-item weather-station">
        <span class="metadata-label">Station:</span>
        <span class="metadata-value">${this.radarData.weatherStation}</span>
      </div>
    `;
  }

  /**
   * Render distance
   */
  private _renderDistance(): TemplateResult {
    if (!this.radarData?.distance) return html``;
    return html`
      <div class="metadata-item distance">
        <span class="metadata-label">Distance:</span>
        <span class="metadata-value">${this.radarData.distance}</span>
      </div>
    `;
  }

  /**
   * Render next update time
   */
  private _renderNextUpdate(): TemplateResult {
    if (!this.radarData?.nextUpdateTime) return html``;
    return html`
      <div class="metadata-item next-update">
        <span class="metadata-label">Next Update:</span>
        <span class="metadata-value">${this.formatTimestamp(this.radarData.nextUpdateTime)}</span>
      </div>
    `;
  }

  /**
   * Render overlay metadata
   */
  private _renderOverlayMetadata(): TemplateResult {
    const config = this._getMetadataConfig();
    if (!config || (typeof config === 'boolean' && !config)) {
      return html``;
    }

    // Handle both object config and boolean true (default)
    const displayConfig = typeof config === 'object' ? config : {};
    
    // Use separate metadata overlay settings if available, otherwise fall back to controls overlay settings
    const opacity = this._config.metadata_overlay_opacity ?? 0.85;
    const position = this._config.metadata_overlay_position ?? 'top';

    return html`
      <div class="metadata-overlay overlay-${position}" style="opacity: ${opacity};">
        ${displayConfig.show_cache_status !== false ? this._renderCacheStatus() : ''}
        ${displayConfig.show_observation_time !== false ? this._renderObservationTime() : ''}
        ${displayConfig.show_forecast_time !== false ? this._renderForecastTime() : ''}
        ${displayConfig.show_weather_station !== false ? this._renderWeatherStation() : ''}
        ${displayConfig.show_distance !== false ? this._renderDistance() : ''}
        ${displayConfig.show_next_update !== false ? this._renderNextUpdate() : ''}
      </div>
    `;
  }

  /**
   * Render radar image with zoom and overlay support
   */
  private _renderRadarImage(): TemplateResult {
    const zoom = this._config.image_zoom || 1.0;
    const fit = this._config.image_fit || 'contain';
    const controlsConfig = this._getControlsConfig();
    const controlsPosition = typeof controlsConfig === 'object' && controlsConfig.position === 'overlay';
    const metadataConfig = this._getMetadataConfig();
    const metadataPosition = typeof metadataConfig === 'object' && metadataConfig.position === 'overlay';
    const currentFrameUrl = this.getCurrentFrameUrl();

    return html`
      <div class="radar-image-container" style="--zoom: ${zoom};">
        ${this.isLoading 
          ? html`
              <div class="loading">
                <ha-circular-progress indeterminate></ha-circular-progress>
                <div class="loading-message">Loading radar data...</div>
              </div>
            `
          : currentFrameUrl 
            ? html`
                <img 
                  class="radar-image radar-image-${fit}"
                  src="${currentFrameUrl}" 
                  alt="Radar frame ${this.currentFrameIndex}"
                  style="transform: scale(${zoom}); transform-origin: center center;"
                  @error="${() => { 
                    this.error = {
                      message: 'Failed to load radar image',
                      type: 'unknown',
                      retryable: true,
                      retryAction: () => this.fetchRadarData(),
                    };
                  }}"
                />
                ${controlsPosition ? this._renderOverlayControls() : ''}
                ${metadataPosition ? this._renderOverlayMetadata() : ''}
              `
            : ''
        }
      </div>
    `;
  }

  /**
   * Render overlay controls
   */
  private _renderOverlayControls(): TemplateResult {
    const config = this._getControlsConfig();
    if (!config || (typeof config === 'boolean' && !config)) {
      return html``;
    }

    const displayConfig = typeof config === 'object' ? config : {};
    const position = this._config.controls_overlay_position ?? 'bottom';
    const opacity = this._config.controls_overlay_opacity ?? 0.9;

    return html`
      <div class="controls-overlay overlay-${position}" style="opacity: ${opacity};">
        ${displayConfig.show_slider !== false ? this._renderFrameSlider() : ''}
        ${displayConfig.show_play_pause !== false ? this._renderPlayPause() : ''}
        ${displayConfig.show_prev_next !== false ? this._renderPrevNext() : ''}
        ${displayConfig.show_frame_info !== false ? this._renderFrameInfo() : ''}
      </div>
    `;
  }

  /**
   * Render controls section
   */
  private _renderControls(position?: 'above' | 'below' | 'overlay'): TemplateResult {
    const config = this._getControlsConfig();
    if (!config || (typeof config === 'boolean' && !config)) {
      return html``;
    }

    const displayConfig = typeof config === 'object' ? config : {};
    // Default position is 'below' if not specified
    const configPosition = displayConfig.position ?? 'below';
    
    // Only render if position matches (or if no position filter specified)
    if (position !== undefined && configPosition !== position) {
      return html``;
    }

    // If overlay, render differently
    if (configPosition === 'overlay') {
      return this._renderOverlayControls();
    }

    return html`
      <div class="controls-section controls-${configPosition}">
        ${displayConfig.show_slider !== false ? this._renderFrameSlider() : ''}
        ${displayConfig.show_nav_buttons !== false ? this._renderNavButtons() : ''}
        ${displayConfig.show_play_pause !== false ? this._renderPlayPause() : ''}
        ${displayConfig.show_prev_next !== false ? this._renderPrevNext() : ''}
        ${displayConfig.show_frame_info !== false ? this._renderFrameInfo() : ''}
      </div>
    `;
  }

  /**
   * Render frame slider
   */
  private _renderFrameSlider(): TemplateResult {
    if (this.frames.length === 0) return html``;

    return html`
      <div class="frame-slider-container">
        <div class="frame-slider-wrapper">
          <input 
            type="range" 
            class="frame-slider" 
            min="0" 
            max="${this.frames.length - 1}" 
            .value="${this.currentFrameIndex}"
            @input="${(e: Event) => this.showFrame(parseInt((e.target as HTMLInputElement).value))}"
            aria-label="Frame slider"
          />
        </div>
      </div>
    `;
  }

  /**
   * Render navigation buttons
   * Only shows skip buttons for timeseries data (extended mode)
   */
  private _renderNavButtons(): TemplateResult {
    if (this.frames.length === 0) return html``;

    // Calculate dynamic skip amount based on total frames (1/3 of total, min 1, max 50)
    const skipAmount = this.isExtendedMode 
      ? Math.max(1, Math.min(50, Math.round(this.frames.length / 3)))
      : 0;

    return html`
      <div class="frame-nav-buttons">
        ${this.isExtendedMode ? html`
          <button 
            class="frame-nav-btn" 
            @click="${() => this.showFrame(0)}"
            ?disabled="${this.currentFrameIndex === 0}"
            title="First frame"
            aria-label="First frame"
          >⏮</button>
          <button 
            class="frame-nav-btn" 
            @click="${() => this.jumpFrame(-skipAmount)}"
            ?disabled="${this.currentFrameIndex === 0}"
            title="Go back ${skipAmount} frames"
            aria-label="Go back ${skipAmount} frames"
          >-${skipAmount}</button>
          <button 
            class="frame-nav-btn" 
            @click="${() => this.jumpFrame(skipAmount)}"
            ?disabled="${this.currentFrameIndex >= this.frames.length - 1}"
            title="Go forward ${skipAmount} frames"
            aria-label="Go forward ${skipAmount} frames"
          >+${skipAmount}</button>
          <button 
            class="frame-nav-btn" 
            @click="${() => this.showFrame(this.frames.length - 1)}"
            ?disabled="${this.currentFrameIndex >= this.frames.length - 1}"
            title="Last frame"
            aria-label="Last frame"
          >⏭</button>
        ` : html`
          <button 
            class="frame-nav-btn" 
            @click="${() => this.showFrame(0)}"
            ?disabled="${this.currentFrameIndex === 0}"
            title="First frame"
            aria-label="First frame"
          >⏮</button>
          <button 
            class="frame-nav-btn" 
            @click="${() => this.showFrame(this.frames.length - 1)}"
            ?disabled="${this.currentFrameIndex >= this.frames.length - 1}"
            title="Last frame"
            aria-label="Last frame"
          >⏭</button>
        `}
      </div>
    `;
  }

  /**
   * Render play/pause button
   */
  private _renderPlayPause(): TemplateResult {
    return html`
      <div class="play-controls">
        <button 
          class="play-btn" 
          @click="${() => this.toggleAnimation()}"
          aria-label="${this.isPlaying ? 'Pause animation' : 'Play animation'}"
          aria-pressed="${this.isPlaying}"
        >
          ${this.isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>
    `;
  }

  /**
   * Render previous/next buttons
   */
  private _renderPrevNext(): TemplateResult {
    return html`
      <div class="play-controls">
        <button 
          class="play-btn" 
          @click="${() => this.previousFrame()}"
          aria-label="Previous frame"
        >◀ Previous</button>
        <button 
          class="play-btn" 
          @click="${() => this.nextFrame()}"
          aria-label="Next frame"
        >Next ▶</button>
      </div>
    `;
  }

  /**
   * Render frame info with observation times
   */
  private _renderFrameInfo(): TemplateResult {
    const currentFrame = this.frames[this.currentFrameIndex];
    if (!currentFrame) return html``;

    const config = this._getMetadataConfig();
    const showFrameTimes = config && typeof config === 'object' && config.show_frame_times !== false;

    // Format frame info
    let frameInfoText = '';
    if (this.isExtendedMode && currentFrame.absoluteObservationTime) {
      frameInfoText = `Frame ${(currentFrame.sequentialIndex ?? this.currentFrameIndex) + 1} of ${this.frames.length}`;
    } else {
      frameInfoText = `Frame ${currentFrame.frameIndex + 1} of ${this.frames.length}`;
    }

    const progress = this.frames.length > 0 
      ? Math.round(((this.currentFrameIndex + 1) / this.frames.length) * 100) 
      : 0;

    return html`
      <div class="frame-info">
        <span class="frame-index">${frameInfoText}</span>
        ${showFrameTimes && currentFrame.absoluteObservationTime ? html`
          <span class="frame-time">
            ${this.formatTimestamp(currentFrame.absoluteObservationTime)}
          </span>
        ` : showFrameTimes && currentFrame.minutesAgo !== undefined ? html`
          <span class="frame-time">
            ${currentFrame.minutesAgo} min ago
          </span>
        ` : ''}
        ${this.radarData?.observationTime && showFrameTimes ? html`
          <span class="observation-time">
            Obs: ${this.formatTimestamp(this.radarData.observationTime)}
          </span>
        ` : ''}
        <span class="frame-progress">${progress}%</span>
      </div>
    `;
  }

  protected override render(): TemplateResult {
    if (!this._config) {
      return html`<hui-warning>Configuration error</hui-warning>`;
    }

    // Use HA card header if title is configured
    const cardTitle = this._config.show_card_title !== false && this._config.card_title
      ? this._config.card_title
      : undefined;

    // Render error state
    if (this.error) {
      const action = this.error.details?.action as string;
      const isManualRefreshRecommended = action === 'manual_refresh_recommended';
      const refreshEndpoint = this.error.details?.refreshEndpoint as string;
      
      const retryInfo = this.error.retryAfter 
        ? html`<div class="error-retry-info">Auto-retrying in ${this.error.retryAfter} seconds...</div>`
        : isManualRefreshRecommended
        ? html`<div class="error-retry-info">Manual refresh recommended. Previous update failed.</div>`
        : '';
      
      // Format error message with line breaks (preserve empty lines)
      const errorLines = this.error.message.split('\n');
      const errorMessage = errorLines.map((line, index) => 
        line.trim() 
          ? html`<div class="error-line">${line}</div>`
          : html`<div class="error-line-spacer"></div>`
      );
      
      // Show additional details if available
      const showDetails = this.error.details && (
        this.error.details.previousUpdateFailed ||
        this.error.details.availableRange ||
        this.error.details.requestedRange ||
        this.error.details.suggestedRange ||
        refreshEndpoint
      );
      
      // Determine icon and color based on error type
      const errorIcon = this._getErrorIcon();
      const errorColor = this._getErrorColor();
      
      return html`
        <ha-card .header=${cardTitle} tabindex="0" role="region" aria-label="BOM Radar Card">
          <div class="error-container">
            <div class="error-card" style="--error-color: ${errorColor}">
              <div class="error-header">
                <ha-icon class="error-icon" .icon=${errorIcon}></ha-icon>
                <div class="error-title">${this._getErrorTitle()}</div>
              </div>
              <div class="error-content">
                <div class="error-message">${errorMessage}</div>
                ${this.error.errorCode ? html`
                  <div class="error-code">
                    <ha-icon class="code-icon" icon="mdi:code-tags"></ha-icon>
                    <span>Error Code: ${this.error.errorCode}</span>
                  </div>
                ` : ''}
                ${showDetails ? html`
                  <div class="error-details">
                    ${this.error.details?.previousUpdateFailed ? html`
                      <div class="error-detail-item">
                        <ha-icon class="detail-icon" icon="mdi:alert-circle"></ha-icon>
                        <div class="detail-content">
                          <strong>Previous Update Failed:</strong> ${this.error.details.previousError || 'Unknown error'}
                          ${this.error.details.previousErrorCode ? html` (${this.error.details.previousErrorCode})` : ''}
                        </div>
                      </div>
                    ` : ''}
                    ${this.error.details?.availableRange ? html`
                      <div class="error-detail-item">
                        <ha-icon class="detail-icon" icon="mdi:database-clock"></ha-icon>
                        <div class="detail-content">
                          <strong>Available Data Range:</strong> ${this.error.details.availableRange.oldest ? this.formatTimestamp(this.error.details.availableRange.oldest) : 'N/A'} to ${this.error.details.availableRange.newest ? this.formatTimestamp(this.error.details.availableRange.newest) : 'N/A'}
                          ${this.error.details.availableRange.totalCacheFolders ? html` (${this.error.details.availableRange.totalCacheFolders} folders)` : ''}
                        </div>
                      </div>
                    ` : ''}
                    ${this.error.details?.requestedRange ? html`
                      <div class="error-detail-item">
                        <ha-icon class="detail-icon" icon="mdi:calendar-range"></ha-icon>
                        <div class="detail-content">
                          <strong>Requested Range:</strong> ${this.error.details.requestedRange.start ? this.formatTimestamp(this.error.details.requestedRange.start) : 'N/A'} to ${this.error.details.requestedRange.end ? this.formatTimestamp(this.error.details.requestedRange.end) : 'N/A'}
                        </div>
                      </div>
                    ` : ''}
                    ${this.error.details?.suggestedRange ? html`
                      <div class="error-detail-item suggested-range">
                        <ha-icon class="detail-icon" icon="mdi:lightbulb-on"></ha-icon>
                        <div class="detail-content">
                          <strong>Suggested Range:</strong> ${this.error.details.suggestedRange.start ? this.formatTimestamp(this.error.details.suggestedRange.start) : 'N/A'} to ${this.error.details.suggestedRange.end ? this.formatTimestamp(this.error.details.suggestedRange.end) : 'N/A'}
                          <div class="suggestion-hint">Try using this time range instead</div>
                        </div>
                      </div>
                    ` : ''}
                    ${refreshEndpoint ? html`
                      <div class="error-detail-item">
                        <ha-icon class="detail-icon" icon="mdi:refresh"></ha-icon>
                        <div class="detail-content">
                          <strong>Refresh Endpoint:</strong> <code>${refreshEndpoint}</code>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
                ${retryInfo}
                ${this.error.retryable && this.error.retryAction ? html`
                  <div class="error-actions">
                    <button
                      class="retry-button"
                      type="button"
                      style="--error-color: ${errorColor}"
                      @click=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (this.error?.retryAction) {
                          this.error.retryAction();
                        }
                      }}
                    >
                      <ha-icon class="retry-icon" icon="mdi:refresh"></ha-icon>
                      <span>${isManualRefreshRecommended ? 'Retry Anyway' : 'Retry Now'}</span>
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card 
        .header=${cardTitle} 
        tabindex="0" 
        role="region" 
        aria-label="BOM Radar Card"
        class=${this._getRootClasses()}
      >
        <div id="root">
          ${this._renderMetadata('above')}
          ${this._renderControls('above')}
          ${this._renderRadarImage()}
          ${this._renderMetadata('below')}
          ${this._renderControls('below')}
        </div>
      </ha-card>
    `;
  }

  /**
   * Get CSS classes for root element
   */
  private _getRootClasses(): string {
    const classes: string[] = [];
    const controlsConfig = this._getControlsConfig();
    const controlsPosition = typeof controlsConfig === 'object' && controlsConfig.position === 'overlay';
    const metadataConfig = this._getMetadataConfig();
    const metadataPosition = typeof metadataConfig === 'object' && metadataConfig.position === 'overlay';
    
    if (controlsPosition || metadataPosition) {
      classes.push('overlay-enabled');
    }
    return classes.join(' ');
  }
}

if (!customElements.get('bom-local-radar-card')) {
  customElements.define('bom-local-radar-card', BomLocalRadarCard);
}









