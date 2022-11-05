import { ColorScheme, ColorSchemeProvider, MantineProvider, MantineThemeOverride, Space } from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { MEDPLUM_VERSION, MedplumClient } from '@medplum/core';
import { UserConfiguration } from '@medplum/fhirtypes';
import { AppShell, Loading, Logo, MedplumProvider, MepdlumNavigateFunction, NavbarMenu } from '@medplum/react';
import {
  Icon,
  IconBrandAsana,
  IconBuilding,
  IconForms,
  IconId,
  IconLock,
  IconLockAccess,
  IconMicroscope,
  IconPackages,
  IconReceipt,
  IconReportMedical,
  IconStar,
  IconWebhook,
} from '@tabler/icons-react';
import React, { Suspense, useState } from 'react';
import { RouterProvider } from 'react-router-dom';

export interface AppProps {
  medplum: MedplumClient;
  router: any;
  navigate: MepdlumNavigateFunction;
}

const theme: MantineThemeOverride = {
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: 500,
        lineHeight: 2.0,
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
};

export function App(props: AppProps): JSX.Element {
  const { medplum, router, navigate } = props;
  const userConfig = medplum.getUserConfiguration();
  const location = window.location;
  const searchParams = new URLSearchParams(location.search);
  const preferredColorScheme = useColorScheme();
  const [specifiedColorScheme, setSpecifiedColorScheme] = useState<ColorScheme | undefined>(undefined);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(specifiedColorScheme ?? preferredColorScheme);

  const toggleColorScheme = (value?: ColorScheme): void => {
    setSpecifiedColorScheme(value);
    setColorScheme(value ?? preferredColorScheme);
  };

  return (
    <React.StrictMode>
      <MedplumProvider medplum={medplum} navigate={navigate}>
        <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
          <MantineProvider theme={{ ...theme, colorScheme }} withGlobalStyles withNormalizeCSS>
            <Notifications position="bottom-right" />
            <AppShell
              logo={<Logo size={24} />}
              pathname={location.pathname}
              searchParams={searchParams}
              version={MEDPLUM_VERSION}
              menus={userConfigToMenu(userConfig)}
              displayAddBookmark={!!userConfig?.id}
              colorScheme={specifiedColorScheme}
              setColorScheme={toggleColorScheme}
            >
              <Suspense fallback={<Loading />}>
                <RouterProvider router={router} />
              </Suspense>
            </AppShell>
          </MantineProvider>
        </ColorSchemeProvider>
      </MedplumProvider>
    </React.StrictMode>
  );
}

function userConfigToMenu(config: UserConfiguration | undefined): NavbarMenu[] {
  const result =
    config?.menu?.map((menu) => ({
      title: menu.title,
      links:
        menu.link?.map((link) => ({
          label: link.name,
          href: link.target as string,
          icon: getIcon(link.target as string),
        })) || [],
    })) || [];

  result.push({
    title: 'Settings',
    links: [
      {
        label: 'Security',
        href: '/security',
        icon: <IconLock />,
      },
    ],
  });

  return result;
}

const resourceTypeToIcon: Record<string, Icon> = {
  Patient: IconStar,
  Practitioner: IconId,
  Organization: IconBuilding,
  ServiceRequest: IconReceipt,
  DiagnosticReport: IconReportMedical,
  Questionnaire: IconForms,
  admin: IconBrandAsana,
  AccessPolicy: IconLockAccess,
  Subscription: IconWebhook,
  batch: IconPackages,
  Observation: IconMicroscope,
};

function getIcon(to: string): JSX.Element | undefined {
  try {
    const resourceType = new URL(to, 'https://app.medplum.com').pathname.split('/')[1];
    if (resourceType in resourceTypeToIcon) {
      const Icon = resourceTypeToIcon[resourceType];
      return <Icon />;
    }
  } catch (e) {
    // Ignore
  }
  return <Space w={30} />;
}
