// Renders the template server-error page for unrecoverable page rendering failures.
import { Component, type ReactNode } from 'react';
import ServerError from '../template/views/pages/misc/server-error-500';

export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey?: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() { return this.state.failed ? <ServerError /> : this.props.children; }
}
