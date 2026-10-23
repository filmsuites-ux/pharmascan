import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft, FileText } from 'lucide-react';

interface Props {
  children: ReactNode;
  onNavigate?: (view: string) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PurchaseErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PurchaseSave] ERROR:', error, errorInfo);
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleBackToReview = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleGoToPurchases = () => {
    console.log('[PurchaseSave] NAVIGATION START');
    try {
      this.props.onNavigate?.('documents');
      console.log('[PurchaseSave] NAVIGATION SUCCESS');
      this.setState({ hasError: false, error: null });
    } catch (err) {
      console.error('[PurchaseSave] ERROR:', err);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-red-500/40 w-full max-w-lg rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center animate-in fade-in duration-200">
            <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl mb-4 border border-red-500/30">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2">
              Something went wrong while saving the purchase record.
            </h3>
            
            <p className="text-xs text-slate-400 mb-4 max-w-sm">
              An unexpected error occurred during the save process. Your scanned document and extracted data have been preserved.
            </p>

            {this.state.error && (
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 mb-6 text-left overflow-auto max-h-24">
                <p className="text-[10px] text-slate-500 font-semibold uppercase mb-1">Error Diagnostic</p>
                <code className="text-xs text-red-400 font-mono break-all">
                  {this.state.error.message || String(this.state.error)}
                </code>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleTryAgain}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                TRY AGAIN
              </button>
              
              <button
                type="button"
                onClick={this.handleBackToReview}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                BACK TO REVIEW
              </button>

              <button
                type="button"
                onClick={this.handleGoToPurchases}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                GO TO PURCHASES
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
