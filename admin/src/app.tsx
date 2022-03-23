import React from 'react';
import { Theme, withStyles, StyleRules } from '@material-ui/core/styles';

import GenericApp from '@iobroker/adapter-react/GenericApp';
import type { GenericAppProps, GenericAppSettings } from '@iobroker/adapter-react/types';
import Logo from '@iobroker/adapter-react/Components/Logo';

import * as Sentry from '@sentry/react';

import Settings from './components/settings';

import * as ioPkg from '../../io-package.json';

const styles = (_theme: Theme): StyleRules => ({
  root: {},
});

class App extends GenericApp {
  constructor(props: GenericAppProps) {
    const extendedProps: GenericAppSettings & { sentryDSN: string } = {
      ...props,
      encryptedFields: [],
      translations: {
        'en': require('./i18n/en.json'),
        'de': require('./i18n/de.json'),
        'ru': require('./i18n/ru.json'),
        'pt': require('./i18n/pt.json'),
        'nl': require('./i18n/nl.json'),
        'fr': require('./i18n/fr.json'),
        'it': require('./i18n/it.json'),
        'es': require('./i18n/es.json'),
        'pl': require('./i18n/pl.json'),
        'zh-cn': require('./i18n/zh-cn.json'),
      },
      sentryDSN: ioPkg.common.plugins.sentry.dsn,
    };
    super(props, extendedProps);
  }

  render() {
    if (!this.state.loaded) {
      return super.render();
    }

    return (
      <Sentry.ErrorBoundary
        fallback={<p>An error has occurred</p>}
        showDialog
      >
        <div className='App' style={{ background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary }}>
          <Logo
            common={this.common}
            instance={this.instance}
            native={this.state.native}
            onError={(err) => this.showError(err) }
            onLoad={(native) => this.setState({ native: { ...native }, changed: true })}
            classes={{} as any}
          />
          <Settings native={this.state.native as ioBroker.AdapterConfig} onChange={(attr, value) => this.updateNativeValue(attr, value)} />
          {this.renderError()}
          {this.renderToast()}
          {this.renderSaveCloseButtons()}
        </div>
      </Sentry.ErrorBoundary>
    );
  }
}

export default withStyles(styles)(App);
