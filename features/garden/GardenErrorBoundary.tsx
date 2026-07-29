"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface GardenErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface GardenErrorBoundaryState {
  failed: boolean;
}

export class GardenErrorBoundary extends Component<
  GardenErrorBoundaryProps,
  GardenErrorBoundaryState
> {
  state: GardenErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): GardenErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void info;
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
