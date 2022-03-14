import React from 'react';

import { Theme, withStyles } from '@material-ui/core/styles';
import { CreateCSSProperties } from '@material-ui/core/styles/withStyles';

import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Checkbox from '@material-ui/core/Checkbox';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormHelperText from '@material-ui/core/FormHelperText';
import Grid from '@material-ui/core/Grid';
import Link from '@material-ui/core/Link';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

import Autocomplete from '@material-ui/lab/Autocomplete';

import I18n from '@iobroker/adapter-react/i18n';

const styles = (theme: Theme): Record<string, CreateCSSProperties> => ({
  root: {
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(2),
    overflow: 'auto',
    height: 'calc(100% - 128px)',
  },
  chip: {
    margin: theme.spacing(1),
  },
  warning: {
    color: theme.palette.warning.main,
    fontWeight: 'bold',
  },
  error: {
    color: theme.palette.error.main,
    fontWeight: 'bold',
  },
  link: {
    textTransform: 'none',
  },
  rightAlign: {
    textAlign: 'right',
  },
  divider: {
    marginTop: '30px',
    marginBottom: '10px',
    '&:first-child': {
      marginTop: 0,
    },
  },
});

interface SettingsProps {
  classes: Record<string, string>;
  native: ioBroker.AdapterConfig;
  onChange: (attr: string, value: any) => void;
}

interface SettingsState {
  featureCollectionLoaded: boolean;
  featureCollectionLoadError: string | null;
  features: (FeaturePropertiesLatest & { label: string })[];
  dialogOpen: boolean;
  avgValue: string;
  maxValue: string;
  minValue: string;
}

class Settings extends React.Component<SettingsProps, SettingsState> {

  /**
   * URL to get the latest data.
   */
  private readonly urlLatest: string = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json';

  /**
   * Maximum number of measuring stations for which the history will be loaded.
   */
  private readonly updateHistoryMaxMstsCount: number = 10;

  constructor(props: SettingsProps) {
    super(props);
    this.state = {
      featureCollectionLoaded: false,
      featureCollectionLoadError: null,
      features: [],
      dialogOpen: true,
      avgValue: '-',
      maxValue: '-',
      minValue: '-',
    };
  }

  /**
   * Load latest data from BfS server when the component did mount.
   */
  public async componentDidMount (): Promise<void> {
    try {
      const res = await fetch(this.urlLatest);
      if (res.status !== 200) {
        console.error('Error loading data from BfS server', res);
        this.setState({
          featureCollectionLoaded: true,
          featureCollectionLoadError: `HTTP ${res.status} ${res.statusText}`,
          dialogOpen: true,
        });
        return;
      }

      const featureCollection: FeatureCollection<FeaturePropertiesLatest> = await res.json();
      if (!featureCollection || !Array.isArray(featureCollection.features)) {
        this.setState({
          featureCollectionLoaded: true,
          featureCollectionLoadError: 'Unexpected response from server',
          features: [],
          dialogOpen: true,
        });
        return;
      }

      const fValues = featureCollection.features.filter((f) => f.properties.value !== null).map((f) => f.properties.value as number);

      this.setState({
        featureCollectionLoaded: true,
        features: featureCollection.features.map((f) => ({
          ...f.properties,
          label: this.getChipLabel(f.properties),
        })),
        maxValue: fValues.length > 0 ? this.formatValue(Math.max(...fValues)) : '-',
        minValue: fValues.length > 0 ? this.formatValue(Math.min(...fValues)) : '-',
        avgValue: fValues.length > 0 ? this.formatValue((fValues.reduce((a, b) => a + b , 0) / fValues.length)) : '-',
      });

    } catch (err) {
      console.error('Error loading data from BfS server: ', err);
      this.setState({
        featureCollectionLoaded: true,
        featureCollectionLoadError: err instanceof Error ? err.toString() : 'unknown',
        features: [],
        dialogOpen: true,
      });
    }
  }

  public render (): React.ReactNode {
    return (
      <div className={this.props.classes.root}>

        {this.state.featureCollectionLoaded || <>
          <Dialog
            open={this.state.dialogOpen}
            maxWidth='sm'
            fullWidth={true}
          >
            <DialogContent>
              <DialogContentText>
                {I18n.t('Please wait while loading data from BfS server …')}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button variant='contained' onClick={() => this.setState({ dialogOpen: false })} color='primary'>{I18n.t('Hide')}</Button>
            </DialogActions>
          </Dialog>
          <Typography variant='subtitle1' className={this.props.classes.warning}>{I18n.t('Please wait while loading data from BfS server …')}</Typography>
        </>}

        {this.state.featureCollectionLoadError && <>
          <Dialog
            open={this.state.dialogOpen}
            maxWidth='sm'
            fullWidth={true}
          >
            <DialogTitle>{I18n.t('Error')}</DialogTitle>
            <DialogContent>
              <DialogContentText className={this.props.classes.error}>
                {I18n.t('Error loading data from BfS Server')}:<br />{this.state.featureCollectionLoadError}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button variant='contained' onClick={() => this.setState({ dialogOpen: false })} color='primary'>{I18n.t('Close')}</Button>
            </DialogActions>
          </Dialog>
          <Typography variant='subtitle1' className={this.props.classes.error}>{I18n.t('Error loading data from BfS Server')}: {this.state.featureCollectionLoadError}</Typography>
        </>}

        <Typography variant='subtitle1' className={this.props.classes.divider}>{I18n.t('Settings')}</Typography>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <Autocomplete
                multiple
                options={this.state.features.map((f) => f.kenn).sort()}
                getOptionLabel={(o) => this.state.features.find((f) => f.kenn === o)?.label || o}
                value={this.props.native.msts}
                onChange={(event, msts) => this.props.onChange('msts', msts.filter((m) => m.match(/^\d{9}$/)).sort())}
                renderInput={(params) => <TextField {...params} label={I18n.t('Measuring points')} fullWidth />}
                fullWidth
                freeSolo
              />
              <FormHelperText>
                {I18n.t('Enter one or more measuring points to load data for.')} {I18n.t('When you type, a search will be done by the identifier, the zip code and the name.')} {I18n.t('You may also enter a valid 9-digit identifier for measuring points not listed by the search.')}
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} sm={12} md={6} lg={4}>
            <FormControl>
              <FormControlLabel
                control={<Checkbox
                  checked={this.props.native.useCosmicTerrestrial}
                  onChange={(e) => this.props.onChange('useCosmicTerrestrial', e.target.checked) }
                />}
                label={I18n.t('Use cosmic and terrestrial components')}
              />
              <FormHelperText>
                {I18n.t('If enabled, additional states for the cosmic and terrestrial ADR components will be used.')}
              </FormHelperText>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={12} md={6} lg={4}>
            <FormControl>
              <FormControlLabel
                control={<Checkbox
                  checked={this.props.native.msts.length <= this.updateHistoryMaxMstsCount && this.props.native.updateHistory}
                  onChange={(e) => this.props.onChange('updateHistory', e.target.checked) }
                  disabled={this.props.native.msts.length > this.updateHistoryMaxMstsCount}
                />}
                label={I18n.t('Update history')}
              />
              <FormHelperText>
                {I18n.t('If this is enabled and a history for a value state is configured, the adapter tries to load missing history values for the last 7 days to fill up the history.')} {I18n.t('Supported history adapters are %s, %s and %s.', 'history', 'influxdb', 'sql')}
              </FormHelperText>
              {this.props.native.msts.length > this.updateHistoryMaxMstsCount && <FormHelperText className={this.props.classes.warning}>
                {I18n.t('You have selected more than %s measuring points, so the history loading feature will be disabled.', this.updateHistoryMaxMstsCount.toString())}
              </FormHelperText>}
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={12} md={6} lg={4}>
            <FormControl fullWidth>
              <TextField
                label={I18n.t('Timeout while loading data')}
                value={this.props.native.timeout}
                type='number'
                fullWidth
                onChange={(e) => this.props.onChange('timeout', e.target.value)}
              />
              <FormHelperText>
                {I18n.t('Timeout for each request to the server in seconds. Default is 30.')}
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>

        <Typography variant='subtitle1' className={this.props.classes.divider}>{I18n.t('Current statistics')}</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('total')}</Typography>
                <Typography variant='body2'>{this.state.features.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('in operation')}</Typography>
                <Typography variant='body2'>{this.state.features.filter((f) => f.site_status === 1).length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('defective')}</Typography>
                <Typography variant='body2'>{this.state.features.filter((f) => f.site_status === 2).length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('test operation')}</Typography>
                <Typography variant='body2'>{this.state.features.filter((f) => f.site_status === 3).length}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('minimum value')}</Typography>
                <Typography variant='body2'>{this.state.minValue}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('maximum value')}</Typography>
                <Typography variant='body2'>{this.state.maxValue}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3} lg={2}>
            <Card>
              <CardContent>
                <Typography variant='subtitle1'>{I18n.t('average value')}</Typography>
                <Typography variant='body2'>{this.state.avgValue}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Typography variant='subtitle1' className={this.props.classes.divider}>{I18n.t('Information')}</Typography>
        <Typography variant='body2'>
          {I18n.t('The ODL measuring network of the Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS) monitor the natural radiation exposure using about 1700 ODL measuring stations.')}
          {I18n.t('The intensity of the local dose rate is sometimes affected by external factors. These include rain, snow and wind.')}
          {I18n.t('Maintenance work, reconstruction of the site, malfunctions of transmitters, malfunctions of probes and regular radiological testing of the probes may lead to a short-term or long-term downtime of measuring stations.')}
          <Link href='https://odlinfo.bfs.de/ODL/DE/themen/was-ist-odl/einflussfaktoren/einflussfaktoren_node.html' target='_blank' rel='noreferrer' underline='hover' variant='body2' className={this.props.classes.link}>{I18n.t('See also detailed information from the BfS.')}</Link>
        </Typography>

        <Typography variant='body2' className={`${this.props.classes.rightAlign} ${this.props.classes.divider}`}>
          {I18n.t('Data')} © <Link href='https://www.bfs.de/' target='_blank' rel='noreferrer' underline='hover' variant='body2' className={this.props.classes.link}>{I18n.t('Federal Office for Radiation Protection (Bundesamt für Strahlenschutz, BfS)')}</Link>, <Link href='http://www.govdata.de/dl-de/by-2-0' target='_blank' rel='noreferrer' underline='hover' className={this.props.classes.link}>{I18n.t('Data license Germany – attribution – Version 2.0')}</Link>
        </Typography>
      </div>
    );
  }

  /**
   * Get the label text for a feature.
   */
  private getChipLabel (properties: FeaturePropertiesLatest): string {
    const statusText = ['in operation', 'defective', 'test operation'][properties.site_status - 1] as 'in operation' | 'defective' | 'test operation';

    if (properties.value) {
      return `${properties.kenn} - ${properties.plz} ${properties.name} (${I18n.t(statusText)}, ${this.formatValue(properties.value)})`;
    } else {
      return `${properties.kenn} - ${properties.plz} ${properties.name} (${I18n.t(statusText)})`;
    }
  }

  /**
   * Format a value with the locale number format, 3 decimal digits and unit.
   */
  private formatValue (val: number): string {
    return Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(val) + ' µSv/h';
  }
}

export default withStyles(styles)(Settings);
