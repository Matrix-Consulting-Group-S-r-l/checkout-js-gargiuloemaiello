import {
    type Address,
    type FormField,
} from '@bigcommerce/checkout-sdk';
import { type FormikProps, withFormik } from 'formik';
import React, { type RefObject, useRef, useState, useEffect } from 'react'; // [MTX] - import useEffect
import { lazy } from 'yup';

import { TranslatedString, withLanguage, type WithLanguageProps } from '@bigcommerce/checkout/locale';
import { useCheckout } from '@bigcommerce/checkout/payment-integration-api';
import { usePayPalFastlaneAddress } from '@bigcommerce/checkout/paypal-fastlane-integration';
import { AddressFormSkeleton, LoadingOverlay, useThemeContext } from '@bigcommerce/checkout/ui';
import { mtxConfig } from '../mtxConfig'; // [MTX] - import mtxConfig

// [MTX] - helper per rendere non obbligatori company + P.IVA su Billing
const getFieldsWithPivaReadonly = (
    getFields: (countryCode?: string) => FormField[],
    countryCode?: string,
): FormField[] => {
    const fields = getFields(countryCode);
    const pIvaId = mtxConfig.AddressCustomFields.pIvaID;

    return fields.map(field => {
        const isPivaField =
            field.name === `field_${pIvaId}` ||
            field.name === `customField[${pIvaId}]` ||
            // a volte BigCommerce usa l'id puro
            field.id === pIvaId;

        const isCompanyField =
            field.name === 'company' ||
            field.name === 'billingAddress.company' ||
            field.name === 'shippingAddress.company' || // safe anche se non usato qui
            field.id === 'company';

        if (isPivaField || isCompanyField) {
            return {
                ...field,
                required: false,
            };
        }

        return field;
    });
};

import {
    AddressForm,
    type AddressFormValues,
    AddressSelect,
    AddressType,
    getAddressFormFieldsValidationSchema,
    getTranslateAddressError,
    isValidCustomerAddress,
    mapAddressToFormValues,
} from '../address';
import { EMPTY_ARRAY, isFloatingLabelEnabled as getIsFloatingLabelEnabled } from '../common/utility';
import { getCustomFormFieldsValidationSchema } from '../formFields';
import { OrderComments } from '../orderComments';
import { getShippableItemsCount } from '../shipping';
import { Button, ButtonVariant } from '../ui/button';
import { Fieldset, Form } from '../ui/form';

import StaticBillingAddress from './StaticBillingAddress';

export type BillingFormValues = AddressFormValues & { orderComment: string };

export interface BillingFormProps {
    methodId?: string;
    billingAddress?: Address;
    customerMessage: string;
    navigateNextStep(): void;
    onSubmit(values: BillingFormValues): void;
    onUnhandledError(error: Error): void;
    getFields(countryCode?: string): FormField[];
}

const BillingForm = ({
    methodId,
    getFields,
    billingAddress,
    setFieldValue,
    values,
    onUnhandledError,
}: BillingFormProps & WithLanguageProps & FormikProps<BillingFormValues>) => {
    const [isResettingAddress, setIsResettingAddress] = useState(false);
    const addressFormRef: RefObject<HTMLFieldSetElement> = useRef(null);
    const { isPayPalFastlaneEnabled, paypalFastlaneAddresses } = usePayPalFastlaneAddress();

    const { themeV2 } = useThemeContext();
    const { checkoutService, checkoutState } = useCheckout();

    const {
        data: { getCustomer, getConfig, getBillingCountries, getCart },
        statuses: { isUpdatingBillingAddress, isUpdatingCheckout },
    } = checkoutState;
    const customer = getCustomer();
    const config = getConfig();
    const cart = getCart();

    if (!config || !customer || !cart) {
        throw new Error('checkout data is not available');
    }

    // --[MTX] -- Init --
    const customerId = customer?.id;

    const companyNameFromGroup = customer?.customerGroup?.name;
    const companyNameFromAddress = customer?.addresses?.[0]?.company;

    const companyName =
        companyNameFromGroup ||
        companyNameFromAddress ||
        billingAddress?.company ||
        '';

    const [companyVat, setCompanyVat] = React.useState<string>(''); // fallback iniziale


    useEffect(() => {
        if (!customerId) {
            return;
        }

        const loadCompanyVat = async () => {
            try {
                const url = `https://www.bigcommerceconnector.com/gem/getCompanyData.php?customerId=${customerId}`;

                const res = await fetch(url, {
                    credentials: 'include',
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();

                if (data.vatNumber) {
                    setCompanyVat(data.vatNumber);
                }
            } catch (error) {
                console.error('[MTX] - errore caricando P.IVA da backend', error);
            }
        };

        loadCompanyVat();
    }, [customerId]);

    useEffect(() => {
        const pIvaId = mtxConfig.AddressCustomFields.pIvaID;
        const pIvaInputId = `field_${pIvaId}Input`; // es: field_30Input

        const intervalId = window.setInterval(() => {
            // --- P.IVA ---
            const pivaInput = document.getElementById(pIvaInputId) as HTMLInputElement | null;

            if (pivaInput) {
                pivaInput.readOnly = true;

                // allinea sempre il valore alla P.IVA aziendale
                if (companyVat && pivaInput.value !== companyVat) {
                    pivaInput.value = companyVat;
                }

                pivaInput.style.backgroundColor = '#f4f4f4';
                pivaInput.style.cursor = 'not-allowed';
            }


            // --- COMPANY / AZIENDA ---
            const companyInput = document.querySelector<HTMLInputElement>(
                'input[name="shippingAddress.company"], input[name="company"]',
            );

            if (companyInput) {
                companyInput.readOnly = true;

                // allinea sempre il valore al companyName risolto dal customer
                if (companyName && companyInput.value !== companyName) {
                    companyInput.value = companyName;
                }

                companyInput.style.backgroundColor = '#f4f4f4';
                companyInput.style.cursor = 'not-allowed';
            }

            // se abbiamo settato almeno uno dei due, possiamo fermare l'intervallo
            if (pivaInput || companyInput) {
                window.clearInterval(intervalId);
            }
        }, 300);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [companyName, companyVat]);

    // --[MTX] -- End --

    const isGuest = customer.isGuest;
    const addresses = customer.addresses;
    const shouldRenderStaticAddress = methodId === 'amazonpay';
    const allFormFields = getFieldsWithPivaReadonly(getFields, values.countryCode);
    const customFormFields = allFormFields.filter(({ custom }) => custom);
    const hasCustomFormFields = customFormFields.length > 0;
    const editableFormFields =
        shouldRenderStaticAddress && hasCustomFormFields ? customFormFields : allFormFields;
    const billingAddresses = isGuest && isPayPalFastlaneEnabled ? paypalFastlaneAddresses : addresses;
    const hasAddresses = billingAddresses?.length > 0;
    const hasValidCustomerAddress =
        billingAddress &&
        isValidCustomerAddress(
            billingAddress,
            billingAddresses,
            getFieldsWithPivaReadonly(getFields, billingAddress.countryCode),
        );
    const isUpdating = isUpdatingBillingAddress() || isUpdatingCheckout();
    const { enableOrderComments } = config.checkoutSettings;
    const shouldShowOrderComments = enableOrderComments && getShippableItemsCount(cart) < 1;

    const handleSelectAddress = async (address: Partial<Address>) => {
        setIsResettingAddress(true);

        try {
            await checkoutService.updateBillingAddress(address);
        } catch (error) {
            if (error instanceof Error) {
                onUnhandledError(error);
            }
        } finally {
            setIsResettingAddress(false);
        }
    };

    const handleUseNewAddress = () => {
        void handleSelectAddress({});
    };

    // Below should be removed once <AddressForm /> is able to reduce prop drilling
    const countries = getBillingCountries() || EMPTY_ARRAY;
    const countriesWithAutocomplete = ['US', 'CA', 'AU', 'NZ', 'GB'];
    const { googleMapsApiKey } = config.checkoutSettings;
    const isFloatingLabelEnabled = getIsFloatingLabelEnabled(config.checkoutSettings)

    return (
        <Form autoComplete="on">
            {shouldRenderStaticAddress && billingAddress && (
                <div className="form-fieldset">
                    <StaticBillingAddress address={billingAddress} />
                </div>
            )}

            <Fieldset id="checkoutBillingAddress" ref={addressFormRef}>
                {hasAddresses && !shouldRenderStaticAddress && (
                    <Fieldset id="billingAddresses">
                        <LoadingOverlay isLoading={isResettingAddress}>
                            <AddressSelect
                                addresses={billingAddresses}
                                onSelectAddress={handleSelectAddress}
                                onUseNewAddress={handleUseNewAddress}
                                selectedAddress={
                                    hasValidCustomerAddress ? billingAddress : undefined
                                }
                                type={AddressType.Billing}
                            />
                        </LoadingOverlay>
                    </Fieldset>
                )}

                {!hasValidCustomerAddress && (
                    <AddressFormSkeleton isLoading={isResettingAddress}>
                        <AddressForm
                            countries={countries}
                            countriesWithAutocomplete={countriesWithAutocomplete}
                            countryCode={values.countryCode}
                            formFields={editableFormFields}
                            googleMapsApiKey={googleMapsApiKey}
                            isFloatingLabelEnabled={isFloatingLabelEnabled}
                            setFieldValue={setFieldValue}
                            shouldShowSaveAddress={!isGuest}
                        />
                    </AddressFormSkeleton>
                )}
            </Fieldset>

            {shouldShowOrderComments && <OrderComments />}

            <div className="form-actions">
                <Button
                    className={themeV2 ? 'body-bold' : ''}
                    disabled={isUpdating || isResettingAddress}
                    id="checkout-billing-continue"
                    isLoading={isUpdating || isResettingAddress}
                    type="submit"
                    variant={ButtonVariant.Primary}
                >
                    <TranslatedString id="common.continue_action" />
                </Button>
            </div>
        </Form>
    );
};

export default withLanguage(
    withFormik<BillingFormProps & WithLanguageProps, BillingFormValues>({
        handleSubmit: (values, { props: { onSubmit } }) => {
            onSubmit(values);
        },
        mapPropsToValues: ({ getFields, customerMessage, billingAddress }) => ({
            ...mapAddressToFormValues(
                getFieldsWithPivaReadonly(
                    getFields,
                    billingAddress && billingAddress.countryCode,
                ),
                billingAddress,
            ),
            orderComment: customerMessage,
        }),
        isInitialValid: ({ billingAddress, getFields, language }) =>
            !!billingAddress &&
            getAddressFormFieldsValidationSchema({
                language,
                formFields: getFieldsWithPivaReadonly(
                    getFields,
                    billingAddress.countryCode,
                ),
            }).isValidSync(billingAddress),
        validationSchema: ({
            language,
            getFields,
            methodId,
        }: BillingFormProps & WithLanguageProps) =>
            methodId === 'amazonpay'
                ? lazy<Partial<AddressFormValues>>((values) =>
                    getCustomFormFieldsValidationSchema({
                        translate: getTranslateAddressError(language),
                        formFields: getFieldsWithPivaReadonly(
                            getFields,
                            values && values.countryCode,
                        ),
                    }),
                )
                : lazy<Partial<AddressFormValues>>((values) =>
                    getAddressFormFieldsValidationSchema({
                        language,
                        formFields: getFieldsWithPivaReadonly(
                            getFields,
                            values && values.countryCode,
                        ),
                    }),
                ),
        enableReinitialize: true,
    })(BillingForm),
);
