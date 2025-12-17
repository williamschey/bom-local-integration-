import { LitElement, html, css, type CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, fireEvent } from 'custom-card-helpers';
import type { TemplateResult } from 'lit';
import { BomLocalRadarCardConfig, MetadataDisplayConfig, ControlsDisplayConfig } from './types';

// Australian states for dropdown
const AUSTRALIAN_STATES = [
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NSW', label: 'New South Wales' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'WA', label: 'Western Australia' },
];

interface CacheRange {
  oldestCache?: {
    cacheFolderName: string;
    cacheTimestamp: string;
  };
  newestCache?: {
    cacheFolderName: string;
    cacheTimestamp: string;
  };
  totalCacheFolders: number;
  timeSpanMinutes?: number;
}

@customElement('bom-local-radar-card-editor')
export class BomLocalRadarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config: BomLocalRadarCardConfig = this._mergeWithDefaults();
  @state() private _metadataExpanded = false;
  @state() private _controlsExpanded = false;
  @state() private _cacheRange?: CacheRange;
  @state() private _cacheRangeError?: string;

  private _mergeWithDefaults(config: Partial<BomLocalRadarCardConfig> = {}): BomLocalRadarCardConfig {
    const defaults: Partial<BomLocalRadarCardConfig> = {
      service_url: 'http://localhost:8082',
      timespan: 'latest',
      frame_interval: 2.0,
      refresh_interval: 30,
      auto_play: true,
      show_card_title: true,
      show_metadata: true,
      show_controls: true,
      image_zoom: 1.0,
      image_fit: 'contain',
    };

    return {
      ...defaults,
      ...config,
      type: 'custom:bom-local-radar-card',
    } as BomLocalRadarCardConfig;
  }

  public setConfig(config: BomLocalRadarCardConfig): void {
    this._config = this._mergeWithDefaults(config);
    this.requestUpdate();
  }

  protected render(): TemplateResult {
    if (!this.hass) return html``;

    return html`
      <div class="editor">
        <div class="section">
          <h3>Service Configuration</h3>
          <ha-textfield
            label="Service URL"
            .value=${this._config.service_url || ''}
            @input=${(e: Event) => this._updateConfig('service_url', (e.target as HTMLInputElement).value)}
            helper="Base URL of bom-local-service (e.g., http://localhost:8082)"
          ></ha-textfield>
          <ha-textfield
            label="Suburb"
            .value=${this._config.suburb || ''}
            @input=${(e: Event) => this._updateConfig('suburb', (e.target as HTMLInputElement).value)}
            required
          ></ha-textfield>
          <div class="select-wrapper">
            <label class="select-label">State *</label>
            <select
              class="native-select"
              .value=${this._config.state || ''}
              @change=${(e: Event) => {
                const select = e.target as HTMLSelectElement;
                this._updateConfig('state', select.value);
              }}
              required
            >
              <option value="">Select a state...</option>
              ${AUSTRALIAN_STATES.map(state => 
                html`<option value="${state.value}">${state.label} (${state.value})</option>`
              )}
            </select>
          </div>
        </div>

        <div class="section">
          <h3>Display</h3>
          <div class="switch-wrapper">
            <label class="switch-label">Show Card Title</label>
            <ha-switch
              .checked=${this._config.show_card_title !== false}
              @change=${(e: Event) => {
                const checked = (e.target as HTMLInputElement).checked;
                this._updateConfig('show_card_title', checked);
              }}
            ></ha-switch>
          </div>
          ${this._config.show_card_title !== false ? html`
            <ha-textfield
              label="Card Title"
              .value=${this._config.card_title || ''}
              @input=${(e: Event) => this._updateConfig('card_title', (e.target as HTMLInputElement).value)}
              helper="Leave empty to use default"
            ></ha-textfield>
          ` : ''}
          
          <div class="metadata-section">
            <div class="section-header">
              <div class="switch-wrapper">
                <label class="switch-label">Show Metadata</label>
                <ha-switch
                  .checked=${this._getMetadataEnabled()}
                  @change=${(e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    this._updateMetadataToggle(checked);
                  }}
                ></ha-switch>
              </div>
              ${this._getMetadataEnabled() ? html`
                <ha-icon-button
                  .label=${this._metadataExpanded ? 'Collapse' : 'Expand'}
                  @click=${() => { this._metadataExpanded = !this._metadataExpanded; }}
                >
                  <ha-icon .icon=${this._metadataExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
                </ha-icon-button>
              ` : ''}
            </div>
            ${this._getMetadataEnabled() && this._metadataExpanded ? html`
              <div class="metadata-options">
                <div class="switch-wrapper">
                  <label class="switch-label">Cache Status</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_cache_status')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_cache_status', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Observation Time</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_observation_time')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_observation_time', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Forecast Time</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_forecast_time')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_forecast_time', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Weather Station</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_weather_station')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_weather_station', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Distance</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_distance')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_distance', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Next Update</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_next_update')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_next_update', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Frame Times</label>
                  <ha-switch
                    .checked=${this._getMetadataConfig('show_frame_times')}
                    @change=${(e: Event) => this._updateMetadataConfig('show_frame_times', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="select-wrapper">
                  <label class="select-label">Metadata Position *</label>
                  <select
                    class="native-select"
                    .value=${String(this._getMetadataConfig('position') ?? 'above')}
                    @change=${(e: Event) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const select = e.target as HTMLSelectElement;
                        const value = select.value;
                        if (value && value !== '') {
                          this._updateMetadataConfig('position', value as 'above' | 'below' | 'overlay');
                        }
                      } catch (err) {
                        console.error('Error updating metadata position:', err);
                      }
                    }}
                  >
                    <option value="above">Above Image (Default)</option>
                    <option value="below">Below Image</option>
                    <option value="overlay">Overlay on Image</option>
                  </select>
                </div>
                ${this._getMetadataConfig('position') === 'overlay' ? html`
                  <div class="select-wrapper">
                    <label class="select-label">Metadata Overlay Position *</label>
                    <select
                      class="native-select"
                      .value=${this._config.metadata_overlay_position ?? 'top'}
                      @change=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const select = e.target as HTMLSelectElement;
                        this._updateConfig('metadata_overlay_position', select.value);
                      }}
                    >
                      <option value="top">Top (Default)</option>
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="center">Center</option>
                    </select>
                  </div>
                  <ha-textfield
                    label="Metadata Overlay Opacity (0.0 - 1.0)"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    .value=${String(this._config.metadata_overlay_opacity ?? 0.85)}
                    @input=${(e: Event) => this._updateConfig('metadata_overlay_opacity', parseFloat((e.target as HTMLInputElement).value))}
                  ></ha-textfield>
                ` : ''}
                ${this._getMetadataConfig('position') !== 'overlay' ? html`
                  <div class="select-wrapper">
                    <label class="select-label">Metadata Style *</label>
                    <select
                      class="native-select"
                      .value=${this._getMetadataConfig('style') ?? 'cards'}
                      @change=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const select = e.target as HTMLSelectElement;
                        const value = select.value;
                        // Allow empty string to reset to default
                        if (value === '') {
                          this._updateMetadataConfig('style', undefined);
                        } else {
                          this._updateMetadataConfig('style', value as 'cards' | 'compact' | 'minimal');
                        }
                      }}
                    >
                      <option value="cards">Cards (Default)</option>
                      <option value="compact">Compact</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>
                ` : html`
                  <div class="info-text" style="padding: 8px; background: var(--info-color, rgba(33, 150, 243, 0.1)); border-radius: 4px; font-size: 0.875em;">
                    <strong>Note:</strong> Overlay position uses a fixed compact style optimized for overlaying on images.
                  </div>
                `}
              </div>
            ` : ''}
          </div>

          <div class="controls-section">
            <div class="section-header">
              <div class="switch-wrapper">
                <label class="switch-label">Show Controls</label>
                <ha-switch
                  .checked=${this._getControlsEnabled()}
                  @change=${(e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    this._updateControlsToggle(checked);
                  }}
                ></ha-switch>
              </div>
              ${this._getControlsEnabled() ? html`
                <ha-icon-button
                  .label=${this._controlsExpanded ? 'Collapse' : 'Expand'}
                  @click=${() => { this._controlsExpanded = !this._controlsExpanded; }}
                >
                  <ha-icon .icon=${this._controlsExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
                </ha-icon-button>
              ` : ''}
            </div>
            ${this._getControlsEnabled() && this._controlsExpanded ? html`
              <div class="controls-options">
                <div class="switch-wrapper">
                  <label class="switch-label">Play/Pause Button</label>
                  <ha-switch
                    .checked=${this._getControlsConfig('show_play_pause')}
                    @change=${(e: Event) => this._updateControlsConfig('show_play_pause', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Previous/Next Buttons</label>
                  <ha-switch
                    .checked=${this._getControlsConfig('show_prev_next')}
                    @change=${(e: Event) => this._updateControlsConfig('show_prev_next', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Frame Slider</label>
                  <ha-switch
                    .checked=${this._getControlsConfig('show_slider')}
                    @change=${(e: Event) => this._updateControlsConfig('show_slider', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Navigation Buttons (-10, +10, First, Last)</label>
                  <ha-switch
                    .checked=${this._getControlsConfig('show_nav_buttons')}
                    @change=${(e: Event) => this._updateControlsConfig('show_nav_buttons', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="switch-wrapper">
                  <label class="switch-label">Frame Info</label>
                  <ha-switch
                    .checked=${this._getControlsConfig('show_frame_info')}
                    @change=${(e: Event) => this._updateControlsConfig('show_frame_info', (e.target as HTMLInputElement).checked)}
                  ></ha-switch>
                </div>
                <div class="select-wrapper">
                  <label class="select-label">Controls Position *</label>
                  <select
                    class="native-select"
                    .value=${String(this._getControlsConfig('position') ?? 'below')}
                    @change=${(e: Event) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const select = e.target as HTMLSelectElement;
                        const value = select.value;
                        if (value && value !== '') {
                          this._updateControlsConfig('position', value as 'above' | 'below' | 'overlay');
                        }
                      } catch (err) {
                        console.error('Error updating controls position:', err);
                      }
                    }}
                  >
                    <option value="above">Above Image</option>
                    <option value="below">Below Image (Default)</option>
                    <option value="overlay">Overlay on Image</option>
                  </select>
                </div>
                ${this._getControlsConfig('position') === 'overlay' ? html`
                  <div class="select-wrapper">
                    <label class="select-label">Controls Overlay Position *</label>
                    <select
                      class="native-select"
                      .value=${this._config.controls_overlay_position ?? 'bottom'}
                      @change=${(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const select = e.target as HTMLSelectElement;
                          this._updateConfig('controls_overlay_position', select.value);
                        } catch (err) {
                          console.error('Error updating controls overlay position:', err);
                        }
                      }}
                    >
                      <option value="top">Top</option>
                      <option value="bottom">Bottom (Default)</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="center">Center</option>
                    </select>
                  </div>
                  <ha-textfield
                    label="Controls Overlay Opacity (0.0 - 1.0)"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    .value=${String(this._config.controls_overlay_opacity ?? 0.9)}
                    @input=${(e: Event) => this._updateConfig('controls_overlay_opacity', parseFloat((e.target as HTMLInputElement).value))}
                  ></ha-textfield>
                  ${(() => {
                    const conflict = this._checkOverlayConflict();
                    return conflict.hasConflict ? html`
                      <div class="warning-text" style="padding: 8px; background: var(--warning-color, rgba(255, 152, 0, 0.1)); border-left: 3px solid var(--warning-color, #ff9800); border-radius: 4px; font-size: 0.875em; margin-top: 8px;">
                        ${conflict.message}
                      </div>
                    ` : '';
                  })()}
                ` : ''}
              </div>
            ` : ''}
          </div>

          <ha-textfield
            label="Image Zoom (1.0 = 100%)"
            type="number"
            step="0.1"
            min="0.5"
            max="3.0"
            .value=${String(this._config.image_zoom || 1.0)}
            @input=${(e: Event) => this._updateConfig('image_zoom', parseFloat((e.target as HTMLInputElement).value))}
            helper="Zoom level: 0.5 = 50%, 1.0 = 100%, 2.0 = 200%"
          ></ha-textfield>
          <div class="select-wrapper">
            <label class="select-label">Image Fit</label>
            <select
              class="native-select"
              .value=${this._config.image_fit || 'contain'}
              @change=${(e: Event) => {
                const select = e.target as HTMLSelectElement;
                this._updateConfig('image_fit', select.value);
              }}
            >
              <option value="contain">Contain (fit entire image)</option>
              <option value="cover">Cover (fill container)</option>
              <option value="fill">Fill (stretch to fit)</option>
            </select>
          </div>
        </div>

        <div class="section">
          <h3>Slideshow</h3>
          <div class="select-wrapper">
            <label class="select-label">Timespan</label>
            <select
              class="native-select"
              .value=${this._config.timespan || 'latest'}
              @change=${(e: Event) => {
                const select = e.target as HTMLSelectElement;
                const newTimespan = select.value as 'latest' | '1h' | '3h' | '6h' | '12h' | '24h' | 'custom';
                // Clear custom time fields if switching away from custom
                if (newTimespan !== 'custom' && this._config.timespan === 'custom') {
                  const updatedConfig: BomLocalRadarCardConfig = { ...this._config };
                  updatedConfig.timespan = newTimespan;
                  delete updatedConfig.custom_start_time;
                  delete updatedConfig.custom_end_time;
                  this._config = updatedConfig;
                  fireEvent(this, 'config-changed', { config: updatedConfig });
                } else {
                  this._updateConfig('timespan', newTimespan);
                }
              }}
            >
              <option value="latest">Latest 7 frames</option>
              ${this._cacheRange && this._cacheRange.totalCacheFolders > 0 ? html`
                <option value="1h">Last 1 hour${this._getRangeWarning('1h') ? ' ⚠️' : ''}</option>
                <option value="3h">Last 3 hours${this._getRangeWarning('3h') ? ' ⚠️' : ''}</option>
                <option value="6h">Last 6 hours${this._getRangeWarning('6h') ? ' ⚠️' : ''}</option>
                <option value="12h">Last 12 hours${this._getRangeWarning('12h') ? ' ⚠️' : ''}</option>
                <option value="24h">Last 24 hours${this._getRangeWarning('24h') ? ' ⚠️' : ''}</option>
              ` : html`
                <option value="1h">Last 1 hour</option>
                <option value="3h">Last 3 hours</option>
                <option value="6h">Last 6 hours</option>
                <option value="12h">Last 12 hours</option>
                <option value="24h">Last 24 hours</option>
              `}
              <option value="custom">Custom time range</option>
            </select>
          </div>
          ${this._cacheRange && this._cacheRange.totalCacheFolders > 0 ? html`
            <div class="cache-range-info">
              <div class="info-text">
                <strong>Available cache:</strong> ${this._formatCacheRange()}
              </div>
            </div>
          ` : this._cacheRangeError ? html`
            <div class="cache-range-warning">
              <div class="warning-text">⚠️ ${this._cacheRangeError}</div>
            </div>
          ` : ''}
          ${this._getRangeWarning(this._config.timespan || 'latest') ? html`
            <div class="range-warning">
              <div class="warning-text">
                ⚠️ Selected timespan may not have enough data. Available: ${this._formatCacheRange()}
              </div>
            </div>
          ` : ''}
          ${this._config.timespan === 'custom' ? html`
            <ha-textfield
              label="Custom Start Time (ISO 8601)"
              .value=${this._config.custom_start_time || ''}
              @input=${(e: Event) => this._updateConfig('custom_start_time', (e.target as HTMLInputElement).value)}
              helper="e.g., 2025-01-15T10:00:00Z"
            ></ha-textfield>
            <ha-textfield
              label="Custom End Time (ISO 8601)"
              .value=${this._config.custom_end_time || ''}
              @input=${(e: Event) => this._updateConfig('custom_end_time', (e.target as HTMLInputElement).value)}
              helper="e.g., 2025-01-15T18:00:00Z"
            ></ha-textfield>
            ${this._validateCustomRange() ? html`
              <div class="range-warning">
                <div class="warning-text">
                  ⚠️ ${this._validateCustomRange()}
                </div>
              </div>
            ` : ''}
          ` : ''}
          <ha-textfield
            label="Frame Interval (seconds)"
            type="number"
            step="0.5"
            min="0.5"
            max="10"
            .value=${String(this._config.frame_interval || 2.0)}
            @input=${(e: Event) => this._updateConfig('frame_interval', parseFloat((e.target as HTMLInputElement).value))}
          ></ha-textfield>
          <div class="switch-wrapper">
            <label class="switch-label">Auto Play</label>
            <ha-switch
              .checked=${this._config.auto_play !== false}
              @change=${(e: Event) => {
                const checked = (e.target as HTMLInputElement).checked;
                this._updateConfig('auto_play', checked);
              }}
            ></ha-switch>
          </div>
        </div>

        <div class="section">
          <h3>Auto Refresh</h3>
          <ha-textfield
            label="Refresh Interval (seconds)"
            type="number"
            min="10"
            max="300"
            step="10"
            .value=${String(this._config.refresh_interval || 30)}
            @input=${(e: Event) => this._updateConfig('refresh_interval', parseInt((e.target as HTMLInputElement).value))}
          ></ha-textfield>
        </div>
      </div>
    `;
  }

  private _updateConfig(key: string, value: unknown): void {
    const config = { ...this._config, [key]: value };
    this._config = config;
    fireEvent(this, 'config-changed', { config });
  }

  // Metadata configuration helpers
  private _getMetadataEnabled(): boolean {
    const config = this._config.show_metadata;
    if (config === undefined || config === true) return true;
    if (typeof config === 'boolean') return config;
    return true; // Object means enabled with custom config
  }

  private _updateMetadataToggle(enabled: boolean): void {
    if (enabled) {
      // If enabling, check if we have existing config or create default
      if (typeof this._config.show_metadata === 'object') {
        // Keep existing config
        return;
      }
      // Create default config object
      this._updateConfig('show_metadata', {});
    } else {
      // Disable metadata
      this._updateConfig('show_metadata', false);
    }
  }

  private _getMetadataConfig(key: keyof MetadataDisplayConfig): boolean | string | undefined {
    const config = this._config.show_metadata;
    if (typeof config === 'boolean') {
      // For boolean config, return default values for position/style, true for others
      if (key === 'position') return 'above';
      if (key === 'style') return 'cards';
      return config;
    }
    if (typeof config === 'object') {
      const value = config[key];
      // For position/style, return the value or undefined (default)
      if (key === 'position' || key === 'style') {
        return value as string | undefined;
      }
      // For boolean fields, default to true if not explicitly false
      return value !== false;
    }
    // Default values
    if (key === 'position') return 'above';
    if (key === 'style') return 'cards';
    return true;
  }

  private _updateMetadataConfig(key: keyof MetadataDisplayConfig, value: boolean | string | undefined): void {
    let config: MetadataDisplayConfig;
    
    if (typeof this._config.show_metadata === 'object') {
      config = { ...this._config.show_metadata };
    } else {
      config = {};
    }
    
    // Handle undefined to remove the key (revert to default)
    if (value === undefined) {
      delete (config as any)[key];
    } else {
      // Type-safe assignment based on key
      if (key === 'position' || key === 'style') {
        (config as any)[key] = value as string;
      } else {
        (config as any)[key] = value as boolean;
      }
    }
    
    // If config is empty, set to true (default)
    if (Object.keys(config).length === 0) {
      this._updateConfig('show_metadata', true);
    } else {
      this._updateConfig('show_metadata', config);
    }
  }

  // Controls configuration helpers
  private _getControlsEnabled(): boolean {
    const config = this._config.show_controls;
    if (config === undefined || config === true) return true;
    if (typeof config === 'boolean') return config;
    return true; // Object means enabled with custom config
  }

  private _updateControlsToggle(enabled: boolean): void {
    if (enabled) {
      // If enabling, check if we have existing config or create default
      if (typeof this._config.show_controls === 'object') {
        // Keep existing config
        return;
      }
      // Create default config object
      this._updateConfig('show_controls', {});
    } else {
      // Disable controls
      this._updateConfig('show_controls', false);
    }
  }

  private _getControlsConfig(key: keyof ControlsDisplayConfig): boolean | string | undefined {
    const config = this._config.show_controls;
    if (typeof config === 'boolean') {
      // For boolean config, return default values for position, true for others
      if (key === 'position') return 'below';
      return config;
    }
    if (typeof config === 'object') {
      const value = config[key];
      // For position, return the value or undefined (default)
      if (key === 'position') {
        return value as string | undefined;
      }
      // For boolean fields, default to true if not explicitly false
      return value !== false;
    }
    // Default values
    if (key === 'position') return 'below';
    return true;
  }

  private _updateControlsConfig(key: keyof ControlsDisplayConfig, value: boolean | string | undefined): void {
    let config: ControlsDisplayConfig;
    
    if (typeof this._config.show_controls === 'object') {
      config = { ...this._config.show_controls };
    } else {
      config = {};
    }
    
    // Handle undefined to remove the key (revert to default)
    if (value === undefined) {
      delete (config as any)[key];
    } else {
      // Type-safe assignment based on key
      if (key === 'position') {
        (config as any)[key] = value as string;
      } else {
        (config as any)[key] = value as boolean;
      }
    }
    
    // If config is empty, set to true (default)
    if (Object.keys(config).length === 0) {
      this._updateConfig('show_controls', true);
    } else {
      this._updateConfig('show_controls', config);
    }
  }

  /**
   * Check if metadata and controls would overlap when both are overlays
   */
  private _checkOverlayConflict(): { hasConflict: boolean; message: string } {
    const metadataConfig = this._getMetadataConfig('position');
    const controlsConfig = this._getControlsConfig('position');
    
    // Both must be overlays to have a conflict
    if (metadataConfig !== 'overlay' || controlsConfig !== 'overlay') {
      return { hasConflict: false, message: '' };
    }
    
    const metadataPos = this._config.metadata_overlay_position ?? 'top';
    const controlsPos = this._config.controls_overlay_position ?? 'bottom';
    
    // Check for conflicts
    if (metadataPos === controlsPos) {
      return {
        hasConflict: true,
        message: `⚠️ Warning: Both metadata and controls are overlayed at the same position (${metadataPos}). They will overlap.`
      };
    }
    
    // Check for adjacent positions that might conflict
    const conflicts: { [key: string]: string[] } = {
      'top': ['top', 'center'],
      'bottom': ['bottom', 'center'],
      'left': ['left', 'center'],
      'right': ['right', 'center'],
      'center': ['top', 'bottom', 'left', 'right', 'center']
    };
    
    if (conflicts[metadataPos]?.includes(controlsPos)) {
      return {
        hasConflict: true,
        message: `⚠️ Warning: Metadata (${metadataPos}) and controls (${controlsPos}) may overlap. Consider using different positions.`
      };
    }
    
    return { hasConflict: false, message: '' };
  }

  static styles: CSSResultGroup = css`
    .editor { 
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    
    .section { 
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      background: var(--card-background-color, #ffffff);
      border-radius: 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
    }
    
    .section h3 { 
      margin: 0;
      font-weight: 600; 
      font-size: 1.1em;
      color: var(--primary-text-color, #212121);
      padding-bottom: 8px;
      border-bottom: 2px solid var(--divider-color, #e0e0e0);
    }
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding: 8px 0;
    }
    
    .metadata-section,
    .controls-section {
      margin-top: 0;
      padding: 12px;
      background: var(--secondary-background-color, #fafafa);
      border-radius: 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
    }
    
    .metadata-options,
    .controls-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }
    
    ha-textfield {
      display: block;
      width: 100%;
      margin-bottom: 0;
    }
    
    .select-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .select-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--primary-text-color, #212121);
    }
    
    .native-select {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, #ffffff);
      color: var(--primary-text-color, #212121);
      font-size: 1rem;
      font-family: inherit;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    
    .native-select:hover {
      border-color: var(--primary-color, #03a9f4);
    }
    
    .native-select:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
      box-shadow: 0 0 0 2px rgba(3, 169, 244, 0.2);
    }
    
    .switch-wrapper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      margin-bottom: 0;
    }
    
    .switch-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--primary-text-color, #212121);
      flex: 1;
      cursor: pointer;
    }
    
    ha-switch {
      margin-left: 16px;
      flex-shrink: 0;
    }
    
    ha-icon-button {
      --mdc-icon-button-size: 32px;
    }

    .cache-range-info {
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--info-color, rgba(33, 150, 243, 0.1));
      border-left: 3px solid var(--info-color, #2196f3);
      border-radius: 4px;
    }

    .cache-range-info .info-text {
      font-size: 0.875em;
      color: var(--primary-text-color, #212121);
    }

    .range-warning,
    .cache-range-warning {
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--warning-color, rgba(255, 152, 0, 0.1));
      border-left: 3px solid var(--warning-color, #ff9800);
      border-radius: 4px;
    }

    .range-warning .warning-text,
    .cache-range-warning .warning-text {
      font-size: 0.875em;
      color: var(--primary-text-color, #212121);
    }
  `;

  private _getRangeWarning(timespan: string): boolean {
    if (!this._cacheRange || this._cacheRange.totalCacheFolders === 0 || timespan === 'latest' || timespan === 'custom') {
      return false;
    }

    const hours = parseInt(timespan.replace('h', '')) || 0;
    const requestedMinutes = hours * 60;
    const availableMinutes = this._cacheRange.timeSpanMinutes || 0;

    return requestedMinutes > availableMinutes;
  }

  private _formatCacheRange(): string {
    if (!this._cacheRange || this._cacheRange.totalCacheFolders === 0) {
      return 'No cache available';
    }

    const oldest = this._cacheRange.oldestCache?.cacheTimestamp;
    const newest = this._cacheRange.newestCache?.cacheTimestamp;
    const timeSpan = this._cacheRange.timeSpanMinutes;

    if (oldest && newest) {
      const oldestDate = new Date(oldest);
      const newestDate = new Date(newest);
      
      // Use local timezone for display
      const locale = this.hass?.locale?.language || 'en-AU';
      const timeZone = this.hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const oldestStr = oldestDate.toLocaleString(locale, {
        timeZone: timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const newestStr = newestDate.toLocaleString(locale, {
        timeZone: timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      
      if (timeSpan) {
        const hours = Math.floor(timeSpan / 60);
        const minutes = timeSpan % 60;
        return `${oldestStr} to ${newestStr} (${hours}h ${minutes}m, ${this._cacheRange.totalCacheFolders} folders)`;
      }
      return `${oldestStr} to ${newestStr} (${this._cacheRange.totalCacheFolders} folders)`;
    }

    return `${this._cacheRange.totalCacheFolders} cache folders available`;
  }

  private _validateCustomRange(): string | null {
    // Only validate if timespan is custom
    if (this._config.timespan !== 'custom') {
      return null;
    }

    if (!this._config.custom_start_time || !this._config.custom_end_time) {
      return null; // No validation needed if fields are empty
    }

    try {
      const startTime = new Date(this._config.custom_start_time);
      const endTime = new Date(this._config.custom_end_time);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return 'Invalid date format. Use ISO 8601 format (e.g., 2025-01-15T10:00:00Z)';
      }

      if (startTime >= endTime) {
        return 'Start time must be before end time';
      }

      if (this._cacheRange && this._cacheRange.oldestCache && this._cacheRange.newestCache) {
        try {
          const oldestCache = new Date(this._cacheRange.oldestCache.cacheTimestamp);
          const newestCache = new Date(this._cacheRange.newestCache.cacheTimestamp);

          if (isNaN(oldestCache.getTime()) || isNaN(newestCache.getTime())) {
            return null; // Can't validate if cache dates are invalid
          }

        if (startTime < oldestCache) {
          const locale = this.hass?.locale?.language || 'en-AU';
          const timeZone = this.hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          const oldestStr = oldestCache.toLocaleString(locale, {
            timeZone: timeZone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `Start time is before available cache (${oldestStr})`;
        }

        if (endTime > newestCache) {
          const locale = this.hass?.locale?.language || 'en-AU';
          const timeZone = this.hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          const newestStr = newestCache.toLocaleString(locale, {
            timeZone: timeZone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `End time is after available cache (${newestStr})`;
        }
        } catch (err) {
          // Ignore cache date parsing errors
          return null;
        }
      }

      return null; // Valid
    } catch (err) {
      return 'Invalid date format';
    }
  }
}









