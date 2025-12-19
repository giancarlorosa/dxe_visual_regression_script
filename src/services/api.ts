/**
 * API Service
 * Handles communication with the Visual Regression Scenarios API endpoint
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';
import { ApiPayload, ApiError, ConnectionTestResult, VrtConfig } from '../types';

export class ApiService {
  private client: AxiosInstance;
  private config: VrtConfig;

  constructor(config: VrtConfig) {
    this.config = config;

    // Create HTTPS agent that allows self-signed certificates if insecure mode is enabled
    const httpsAgent = config.insecure
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    this.client = axios.create({
      timeout: config.playwright.timeout,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      httpsAgent,
    });
  }

  /**
   * Build authorization headers if token is provided
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    return headers;
  }

  /**
   * Fetch scenarios from the API endpoint
   */
  async fetchScenarios(): Promise<ApiPayload> {
    try {
      const response: AxiosResponse<ApiPayload> = await this.client.get(
        this.config.endpoint,
        {
          headers: this.getAuthHeaders(),
        }
      );

      // Validate payload structure
      if (!response.data.meta || !response.data.viewports || !response.data.scenarios) {
        throw new Error('Invalid payload structure: missing meta, viewports, or scenarios');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiError>;

        if (axiosError.response) {
          const status = axiosError.response.status;
          const errorData = axiosError.response.data;

          if (status === 401) {
            const code = errorData?.error?.code || 'UNAUTHORIZED';
            const message = errorData?.error?.message || 'Authentication required';
            throw new Error(`Authentication failed (${code}): ${message}`);
          }

          if (status === 500) {
            const code = errorData?.error?.code || 'SERVER_ERROR';
            const message = errorData?.error?.message || 'Internal server error';
            throw new Error(`Server error (${code}): ${message}`);
          }

          throw new Error(
            `HTTP ${status}: ${errorData?.error?.message || axiosError.message}`
          );
        }

        if (axiosError.code === 'ECONNREFUSED') {
          throw new Error(`Connection refused: Unable to connect to ${this.config.endpoint}`);
        }

        if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
          throw new Error(`Request timeout: The endpoint took too long to respond`);
        }

        if (axiosError.code === 'ENOTFOUND') {
          throw new Error(`DNS lookup failed: Unable to resolve ${this.config.endpoint}`);
        }

        throw new Error(`Network error: ${axiosError.message}`);
      }

      throw error;
    }
  }

  /**
   * Test the connection to the API endpoint
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      const response: AxiosResponse<ApiPayload> = await this.client.get(
        this.config.endpoint,
        {
          headers: this.getAuthHeaders(),
        }
      );

      const responseTime = Date.now() - startTime;
      const payload = response.data;

      // Validate basic structure
      if (!payload.meta || !payload.viewports || !payload.scenarios) {
        return {
          success: false,
          endpoint: this.config.endpoint,
          statusCode: response.status,
          responseTime,
          error: 'Invalid payload structure: missing meta, viewports, or scenarios',
        };
      }

      return {
        success: true,
        endpoint: this.config.endpoint,
        statusCode: response.status,
        scenarioCount: payload.meta.scenario_count,
        viewportCount: payload.meta.viewport_count,
        isRegenerating: payload.meta.is_regenerating,
        tokenRequired: payload.meta.token_required,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiError>;

        if (axiosError.response) {
          const status = axiosError.response.status;
          const errorData = axiosError.response.data;

          return {
            success: false,
            endpoint: this.config.endpoint,
            statusCode: status,
            responseTime,
            error: errorData?.error?.message || axiosError.message,
          };
        }

        let errorMessage = axiosError.message;

        if (axiosError.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused - is the server running?';
        } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
          errorMessage = 'Connection timeout - server took too long to respond';
        } else if (axiosError.code === 'ENOTFOUND') {
          errorMessage = 'DNS lookup failed - check the endpoint URL';
        } else if (axiosError.code === 'CERT_HAS_EXPIRED') {
          errorMessage = 'SSL certificate has expired';
        } else if (axiosError.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          errorMessage = 'SSL certificate verification failed';
        }

        return {
          success: false,
          endpoint: this.config.endpoint,
          responseTime,
          error: errorMessage,
        };
      }

      return {
        success: false,
        endpoint: this.config.endpoint,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a subset of scenarios filtered by IDs
   */
  async fetchFilteredScenarios(
    scenarioIds?: string[],
    viewportKeys?: string[]
  ): Promise<ApiPayload> {
    const payload = await this.fetchScenarios();

    let filteredScenarios = payload.scenarios;
    let filteredViewports = payload.viewports;

    // Filter scenarios by ID if provided
    if (scenarioIds && scenarioIds.length > 0) {
      filteredScenarios = filteredScenarios.filter((s) =>
        scenarioIds.some(
          (id) =>
            s.id === id ||
            s.id.includes(id) ||
            s.title.toLowerCase().includes(id.toLowerCase())
        )
      );
    }

    // Filter viewports if provided
    if (viewportKeys && viewportKeys.length > 0) {
      filteredViewports = filteredViewports.filter((v) =>
        viewportKeys.includes(v.machine_name)
      );

      // Also filter scenario viewport_keys to only include matching viewports
      filteredScenarios = filteredScenarios.map((s) => ({
        ...s,
        viewport_keys: s.viewport_keys.filter((vk) => viewportKeys.includes(vk)),
      }));

      // Remove scenarios that have no matching viewports
      filteredScenarios = filteredScenarios.filter(
        (s) => s.viewport_keys.length > 0
      );
    }

    return {
      meta: {
        ...payload.meta,
        scenario_count: filteredScenarios.length,
        viewport_count: filteredViewports.length,
      },
      viewports: filteredViewports,
      scenarios: filteredScenarios,
    };
  }
}
