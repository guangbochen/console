import * as _ from 'lodash';
import * as React from 'react';
import cx from 'classnames';
import { Helmet } from 'react-helmet';
import { match } from 'react-router';
import { FileUpload, ActionGroup, Alert, Button } from '@patternfly/react-core';
import { isCephProvisioner, isObjectSC } from '@console/shared/src/utils';
import { K8sResourceKind, apiVersionForModel } from '@console/internal/module/k8s';
import {
  ButtonBar,
  RequestSizeInput,
  history,
  resourcePath,
} from '@console/internal/components/utils';
import { StorageClassDropdown } from '@console/internal/components/utils/storage-class-dropdown';
import { RadioInput } from '@console/internal/components/radio';
import { StorageClass } from '@console/internal/components/storage-class-form';
import {
  cephRBDProvisionerSuffix,
  provisionerAccessModeMapping,
  initialAccessModes,
  accessModeRadios,
  dropdownUnits,
  getAccessModeForProvisioner,
} from '@console/internal/components/storage/shared';
import { DataVolumeModel } from '../../../models';
import { createUploadPVC } from '../../../k8s/requests/cdi-upload/cdi-upload-requests';
import { CDIUploadContext } from '../cdi-upload-provider';
import { UploadPVCFormStatus } from './upload-pvc-form-status';
import { PersistentVolumeClaimModel } from '@console/internal/models';
import { getName } from '@console/shared';
import { V1alpha1DataVolume } from '../../../types/vm/disk/V1alpha1DataVolume';
import './upload-pvc-form.scss';

export const UploadPVCForm: React.FC<UploadPVCFormProps> = (props) => {
  const [accessModeHelp, setAccessModeHelp] = React.useState('Permissions to the mounted drive.');
  const [allowedAccessModes, setAllowedAccessModes] = React.useState(initialAccessModes);
  const [storageClass, setStorageClass] = React.useState('');
  const [pvcName, setPvcName] = React.useState('');
  const [accessMode, setAccessMode] = React.useState('ReadWriteOnce');
  const [requestSizeValue, setRequestSizeValue] = React.useState('');
  const [requestSizeUnit, setRequestSizeUnit] = React.useState('Gi');
  const [storageProvisioner, setStorageProvisioner] = React.useState('');
  const { namespace, onChange, fileName, handleFileChange, fileValue } = props;

  React.useEffect(() => {
    const updateDV = (): K8sResourceKind => {
      const obj: K8sResourceKind = {
        apiVersion: apiVersionForModel(DataVolumeModel),
        kind: DataVolumeModel.kind,
        metadata: {
          name: pvcName,
          namespace,
        },
        spec: {
          source: {
            upload: {},
          },
          pvc: {
            accessModes: [accessMode],
            resources: {
              requests: {
                storage: `${requestSizeValue}${requestSizeUnit}`,
              },
            },
          },
        },
      };

      if (storageClass) {
        obj.spec.pvc.storageClassName = storageClass;

        // should set block only for RBD + RWX
        if (
          _.endsWith(storageProvisioner, cephRBDProvisionerSuffix) &&
          accessMode === 'ReadWriteMany'
        ) {
          obj.spec.volumeMode = 'Block';
        }
      }

      return obj;
    };
    onChange(updateDV);
  }, [
    accessMode,
    namespace,
    pvcName,
    onChange,
    storageClass,
    requestSizeValue,
    requestSizeUnit,
    storageProvisioner,
  ]);

  const handleStorageClass = (updatedStorageClass) => {
    const provisioner: string = updatedStorageClass?.provisioner || '';
    // if the provisioner is unknown or no storage class selected, user should be able to set any access mode
    const modes = provisionerAccessModeMapping[provisioner]
      ? provisionerAccessModeMapping[provisioner]
      : getAccessModeForProvisioner(provisioner);
    // setting message to display for various modes when a storage class of a know provisioner is selected
    const displayMessage =
      provisionerAccessModeMapping[provisioner] || isCephProvisioner(provisioner)
        ? 'Access mode is set by storage class and cannot be changed.'
        : 'Permissions to the mounted drive.';
    setAccessMode('ReadWriteOnce');
    setAccessModeHelp(displayMessage);
    // setting accessMode to default with the change to Storage Class selection
    setAllowedAccessModes(modes);
    setStorageClass(updatedStorageClass?.metadata?.name);
    setStorageProvisioner(provisioner);
  };

  const handleRequestSizeInputChange = (obj) => {
    setRequestSizeValue(obj.value);
    setRequestSizeUnit(obj.unit);
  };

  const handlePvcName: React.ReactEventHandler<HTMLInputElement> = (event) => {
    setPvcName(event.currentTarget.value);
  };

  const handleAccessMode: React.ReactEventHandler<HTMLInputElement> = (event) => {
    setAccessMode(event.currentTarget.value);
  };

  const onlyPvcSCs = React.useCallback((sc: StorageClass) => !isObjectSC(sc), []);

  return (
    <div>
      <div className="form-group">
        <Alert title="Persistent volume creation" variant="info" isInline>
          This Persistent Volume Claim will be created using a DataVolume through Containerized Data
          Importer (CDI)
        </Alert>
      </div>
      <label className="control-label co-required" htmlFor="file-upload">
        Upload Data
      </label>
      <div className="form-group">
        <FileUpload
          id="file-upload"
          value={fileValue}
          filename={fileName}
          onChange={handleFileChange}
          hideDefaultPreview
          isRequired
        />
      </div>
      <div className="form-group">
        <StorageClassDropdown
          onChange={handleStorageClass}
          id="storageclass-dropdown"
          describedBy="storageclass-dropdown-help"
          required={false}
          name="storageClass"
          filter={onlyPvcSCs}
        />
      </div>
      <label className="control-label co-required" htmlFor="pvc-name">
        Persistent Volume Claim Name
      </label>
      <div className="form-group">
        <input
          className="pf-c-form-control"
          type="text"
          onChange={handlePvcName}
          placeholder="my-storage-claim"
          aria-describedby="pvc-name-help"
          id="pvc-name"
          name="pvcName"
          required
        />
        <p className="help-block" id="pvc-name-help">
          A unique name for the storage claim within the project.
        </p>
      </div>
      <label className="control-label co-required" htmlFor="access-mode">
        Access Mode
      </label>
      <div className="form-group">
        {accessModeRadios.map((radio) => {
          let radioObj = null;
          const disabled = !allowedAccessModes.includes(radio.value);

          allowedAccessModes.forEach((mode) => {
            const checked = !disabled ? radio.value === accessMode : radio.value === mode;
            radioObj = (
              <RadioInput
                {...radio}
                key={radio.value}
                onChange={handleAccessMode}
                inline
                disabled={disabled}
                checked={checked}
                aria-describedby="access-mode-help"
                name="accessMode"
              />
            );
          });

          return radioObj;
        })}
        <p className="help-block" id="access-mode-help">
          {accessModeHelp}
        </p>
      </div>
      <label className="control-label co-required" htmlFor="request-size-input">
        Size
      </label>
      <RequestSizeInput
        name="requestSize"
        required
        onChange={handleRequestSizeInputChange}
        defaultRequestSizeUnit={requestSizeUnit}
        defaultRequestSizeValue={requestSizeValue}
        dropdownUnits={dropdownUnits}
        describedBy="request-size-help"
        inputID="request-size-input"
      />
      <p className="help-block" id="request-size-help">
        Ensure your PVC size covers the requirements of the uncompressed image and any other space
        requirements
      </p>
    </div>
  );
};

export const UploadPVCPage: React.FC<UploadPVCPageProps> = (props) => {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [fileValue, setFileValue] = React.useState<File>(null);
  const [fileName, setFileName] = React.useState('');
  const [error, setError] = React.useState('');
  const [isAllocating, setIsAllocating] = React.useState(false);
  const [dvObj, setDvObj] = React.useState<V1alpha1DataVolume>(null);

  const { uploads, uploadData } = React.useContext(CDIUploadContext);
  const namespace = props?.match?.params?.ns;
  const title = 'Upload Data to Persistent Volume Claim';

  const save = (e: React.FormEvent<EventTarget>) => {
    e.preventDefault();
    if (!fileName) {
      setError('File input is missing');
    } else {
      setError('');
      setIsAllocating(true);
      setIsSubmitting(true);
      createUploadPVC(dvObj)
        .then(({ token }) => {
          setIsAllocating(false);
          uploadData({
            file: fileValue,
            token,
            pvcName: getName(dvObj),
            namespace,
          });
        })
        .catch(({ message }: { message: string }) => {
          setIsAllocating(false);
          setError(message || 'Could not create persistent volume claim.');
        });
    }
  };

  const handleFileChange = (value, filename) => {
    setFileName(filename);
    setFileValue(value);
  };

  return (
    <>
      <Helmet>
        <title>{title}</title>
      </Helmet>
      <div
        className={cx('co-m-pane__body co-m-pane__form', {
          'kv--create-upload__hide': isSubmitting,
        })}
      >
        <h1 className="co-m-pane__heading co-m-pane__heading--baseline">
          <div className="co-m-pane__name">{title}</div>
        </h1>
        <form className="co-m-pane__body-group" onSubmit={save}>
          <UploadPVCForm
            onChange={setDvObj}
            namespace={namespace}
            fileValue={fileValue}
            fileName={fileName}
            handleFileChange={handleFileChange}
          />
          <ButtonBar errorMessage={error}>
            <ActionGroup className="pf-c-form">
              <Button id="save-changes" type="submit" variant="primary">
                Upload
              </Button>
              <Button onClick={history.goBack} type="button" variant="secondary">
                Cancel
              </Button>
            </ActionGroup>
          </ButtonBar>
        </form>
      </div>
      <UploadPVCFormStatus
        upload={uploads.find(
          (upl) => upl.pvcName === getName(dvObj) && upl.namespace === namespace,
        )}
        isSubmitting={isSubmitting}
        isAllocating={isAllocating}
        allocateError={error}
        onErrorClick={() => {
          setIsSubmitting(false);
          setError('');
        }}
        onSuccessClick={() =>
          history.push(resourcePath(PersistentVolumeClaimModel.kind, getName(dvObj), namespace))
        }
        onCancelFinish={() => history.push(resourcePath(PersistentVolumeClaimModel.kind))}
      />
    </>
  );
};

export type UploadPVCFormProps = {
  namespace: string;
  fileValue: string | File;
  fileName: string;
  onChange: (K8sResourceKind) => void;
  handleFileChange: (value, filename, event) => void;
};

export type UploadPVCPageProps = {
  match: match<{ ns?: string }>;
};
