import { RadarResponse, RadarTimeSeriesResponse, RadarFrame, ErrorState } from '../types';
import { parseApiError, parseErrorResponse } from '../utils/error-handler';
import { resolveImageUrl } from '../utils/url-resolver';
import { HomeAssistant } from 'custom-card-helpers';

export interface FetchRadarOptions {
  hass: HomeAssistant;
  suburb: string;
  state: string;
  timespan?: string;
  customStartTime?: string;
  customEndTime?: string;
  onError: (error: ErrorState) => void;
}

export class RadarApiService {
  /**
   * Fetches latest radar frames via HA WebSocket API
   */
  async fetchLatestFrames(options: FetchRadarOptions): Promise<RadarResponse | null> {
    const { hass, suburb, state, onError } = options;
    
    try {
      const data = await hass.callWS<any>({
        type: 'bom_local/get_radar_data',
        suburb,
        state,
      });

      // Handle service-level errors (e.g. CACHE_NOT_FOUND)
      if (data.errorCode || data.ErrorCode || data.error) {
        const error = parseApiError(
          { ok: false, status: 404, statusText: 'Not Found', url: '/api/radar' } as Response,
          data,
          true,
          {
            retryAction: () => this.fetchLatestFrames(options),
            defaultRetryAfter: 30,
          }
        );
        onError(error);
        return null;
      }

      // Validate response has frames
      if (!data.frames || data.frames.length === 0) {
        throw new Error('No frames available in response');
      }

      // Resolve relative image URLs through HA proxy
      data.frames.forEach((frame: RadarFrame) => {
        if (frame.imageUrl) {
          frame.imageUrl = resolveImageUrl(frame.imageUrl);
        }
      });

      return data;
    } catch (err: any) {
      this.handleFetchError(err, options);
      return null;
    }
  }

  /**
   * Fetches historical radar data via HA WebSocket API
   */
  async fetchHistoricalFrames(options: FetchRadarOptions): Promise<RadarResponse | null> {
    const { hass, suburb, state, timespan, customStartTime, customEndTime, onError } = options;
    
    try {
      let startTime: string | null = null;
      let endTime = new Date().toISOString();

      if (timespan === 'custom') {
        if (customStartTime) startTime = new Date(customStartTime).toISOString();
        if (customEndTime) endTime = new Date(customEndTime).toISOString();
      } else if (timespan) {
        const hours = parseInt(timespan.replace('h', '')) || 1;
        startTime = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
      }

      if (!startTime) {
        throw new Error('Invalid timespan configuration');
      }

      const data = await hass.callWS<any>({
        type: 'bom_local/get_radar_data',
        suburb,
        state,
        startTime,
        endTime,
      });
      
      // Handle service-level errors (e.g. TIME_RANGE_ERROR or CACHE_NOT_FOUND)
      if (data.errorCode || data.ErrorCode || data.error) {
        const error = parseApiError(
          { ok: false, status: 404, statusText: 'Not Found', url: '/timeseries' } as Response,
          data,
          true,
          {
            retryAction: () => this.fetchHistoricalFrames(options),
            defaultRetryAfter: 30,
          }
        );
        onError(error);
        return null;
      }

      if (!data.cacheFolders || data.cacheFolders.length === 0) {
        throw new Error('No historical data found for the specified time range.');
      }

      // Flatten all frames from all cache folders
      const allFrames: RadarFrame[] = [];
      data.cacheFolders.forEach(cacheFolder => {
        cacheFolder.frames.forEach(frame => {
          frame.cacheTimestamp = cacheFolder.cacheTimestamp;
          frame.observationTime = cacheFolder.observationTime;
          frame.cacheFolderName = cacheFolder.cacheFolderName;
          
          if (frame.imageUrl) {
            frame.imageUrl = resolveImageUrl(frame.imageUrl);
          }
          
          if (!frame.absoluteObservationTime && frame.observationTime && frame.minutesAgo !== undefined) {
            const obsTime = new Date(frame.observationTime);
            frame.absoluteObservationTime = new Date(obsTime.getTime() - (frame.minutesAgo * 60 * 1000)).toISOString();
          }
          
          allFrames.push(frame);
        });
      });

      // Re-index frames sequentially
      allFrames.sort((a, b) => new Date(a.absoluteObservationTime!).getTime() - new Date(b.absoluteObservationTime!).getTime());
      allFrames.forEach((frame, idx) => {
        frame.sequentialIndex = idx;
      });

      // Fetch latest metadata for display
      let metadata: Partial<RadarResponse> = {};
      try {
        metadata = await hass.callWS<RadarResponse>({
          type: 'bom_local/get_radar_data',
          suburb,
          state
        });
      } catch (err) {
        console.debug('Could not fetch metadata:', err);
      }

      const newestCacheFolder = data.cacheFolders[data.cacheFolders.length - 1];
      const radarResponse: RadarResponse = {
        frames: allFrames,
        lastUpdated: endTime,
        observationTime: metadata.observationTime || newestCacheFolder?.observationTime || endTime,
        forecastTime: metadata.forecastTime || endTime,
        weatherStation: metadata.weatherStation,
        distance: metadata.distance,
        cacheIsValid: metadata.cacheIsValid ?? true,
        cacheExpiresAt: metadata.cacheExpiresAt || endTime,
        isUpdating: metadata.isUpdating || false,
        nextUpdateTime: metadata.nextUpdateTime || endTime,
      };

      return radarResponse;
    } catch (err: any) {
      this.handleFetchError(err, options);
      return null;
    }
  }

  /**
   * Handles fetch errors and categorizes them appropriately
   */
  private handleFetchError(err: any, options: FetchRadarOptions): void {
    const message = err?.message || (typeof err === 'string' ? err : 'Unknown error occurred');
    options.onError({
      message: message,
      type: 'unknown',
      retryable: true,
      retryAction: () => this.fetchLatestFrames(options),
    });
  }
}

