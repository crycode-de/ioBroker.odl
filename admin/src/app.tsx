import React from 'react';
import { Theme, withStyles, StyleRules } from '@material-ui/core/styles';

import GenericApp from '@iobroker/adapter-react/GenericApp';
import type { GenericAppProps, GenericAppSettings } from '@iobroker/adapter-react/types';
import Logo from '@iobroker/adapter-react/Components/Logo';

import Settings from './components/settings';

const styles = (_theme: Theme): StyleRules => ({
  root: {},
});

class App extends GenericApp {
  constructor(props: GenericAppProps) {
    const extendedProps: GenericAppSettings = {
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
    };
    super(props, extendedProps);
  }

  render() {
    if (!this.state.loaded) {
      return super.render();
    }

    return (
      <div className='App' style={{ background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary }}>
        <Logo
          common={this.common}
          instance={this.instance}
          native={this.state.native}
          onError={(err) => this.showError(err) }
          onLoad={(native) => this.setState({ native: { ...native }, changed: true })}
          classes={{} as any}
        />
        <Settings native={this.state.native} onChange={(attr, value) => this.updateNativeValue(attr, value)} />
        {this.renderError()}
        {this.renderToast()}
        {this.renderSaveCloseButtons()}
      </div>
    );
  }
}

export default withStyles(styles)(App);